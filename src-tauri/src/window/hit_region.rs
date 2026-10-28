//! Per-region hit testing: only the VISIBLE island surfaces catch the mouse.
//!
//! WHY this exists: the island is ONE fixed 640x720 transparent window (see
//! `window/mod.rs`), but the thing you can actually see is usually a ~160x30
//! pill. Without this, that whole invisible rectangle swallows every click and
//! hover at the top of the screen, so the desktop, title bars and app UI behind
//! it stop responding.
//!
//! WHY `SetWindowRgn` and not the obvious alternatives (all measured/verified,
//! see docs/windows-notes.md):
//! - `set_ignore_cursor_events` is WHOLE-window only, and turning it on kills
//!   hover, so the pill could never open.
//! - `WM_NCHITTEST` + `HTTRANSPARENT` fails twice over: it only falls through
//!   to windows on the SAME thread (never to another process's window), and in
//!   a Tauri window the WebView2 child covers the client area, so the top-level
//!   window procedure is not consulted for those points anyway.
//! - Resizing the OS window per state clipped the panel and flyouts, which is
//!   why the fixed-canvas design exists in the first place.
//!
//! `SetWindowRgn` changes the window's actual SHAPE. The OS routes input
//! outside the shape to whatever window is underneath, across processes, which
//! is exactly the behavior we need.
//!
//! The one cost: the region clips RENDERING as well as hit testing, so a rect
//! must also cover its own CSS shadow/glow overflow. The frontend sends a `pad`
//! per surface for that; see `src/app/hit-regions.ts`.

use std::sync::Mutex;

use serde::Deserialize;
// `Manager` brings `try_state` into scope for WebviewWindow.
use tauri::{Manager, WebviewWindow};

/// One interactive surface, in LOGICAL pixels relative to the webview's
/// top-left (which is what `getBoundingClientRect()` gives the frontend).
///
/// `pad` grows the box so the window region does not clip that surface's CSS
/// shadow/glow. `radius` rounds the corners so a pill-shaped surface does not
/// claim the dead corners of its bounding box.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    #[serde(default)]
    pub radius: f64,
    #[serde(default)]
    pub pad: f64,
}

/// The last rects the frontend published. Cached because the region is stored
/// in PHYSICAL pixels: a DPI change invalidates it and we must re-apply without
/// waiting for a frontend round-trip.
#[derive(Default)]
pub struct HitRegionState(pub Mutex<Vec<HitRect>>);

/// Remember `rects` and apply them as the window's shape.
///
/// An empty list is ignored on purpose: the pill (or handle, or status bar) is
/// always on screen, so "no interactive surfaces" means the frontend has not
/// measured yet. Applying an empty region there would make the window vanish.
pub fn set(window: &WebviewWindow, rects: Vec<HitRect>) -> Result<(), String> {
    if rects.is_empty() {
        return Ok(());
    }
    if let Some(state) = window.try_state::<HitRegionState>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = rects.clone();
        }
    }
    match apply(window, &rects) {
        Ok(()) => Ok(()),
        Err(e) => {
            // Fail OPEN, never closed. A half-applied or rejected region could
            // leave the UI unreachable, so drop the shape entirely: the window
            // goes back to catching clicks everywhere, which is the bug this
            // module fixes but still a usable app.
            clear(window);
            Err(e)
        }
    }
}

/// Re-apply the cached rects. Called after a DPI/scale change, where the
/// logical rects are still correct but their physical pixel values are not.
pub fn reapply(window: &WebviewWindow) {
    let cached = window
        .try_state::<HitRegionState>()
        .and_then(|s| s.0.lock().ok().map(|g| g.clone()))
        .unwrap_or_default();
    if cached.is_empty() {
        return;
    }
    if let Err(e) = apply(window, &cached) {
        eprintln!("islet: re-applying the hit region failed: {e}");
    }
}

/// Drop the shape entirely, making the whole window hit-testable again.
///
/// This is the fail-safe: a fully-interactive window is annoying (it is the bug
/// this module fixes) but it is still a working app, whereas a wrong region can
/// hide the UI. Used on teardown and whenever applying a region errors.
pub fn clear(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Gdi::SetWindowRgn;
        if let Ok(h) = window.hwnd() {
            // SAFETY: `h` is this process's live top-level window. Passing None
            // removes any region, which is always valid.
            unsafe {
                SetWindowRgn(HWND(h.0 as *mut _), None, true);
            }
        }
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
fn apply(window: &WebviewWindow, rects: &[HitRect]) -> Result<(), String> {
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::Graphics::Gdi::{
        ClientToScreen, CombineRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn,
        HGDIOBJ, RGN_OR,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    let handle = window
        .hwnd()
        .map_err(|e| format!("could not get the window handle: {e}"))?;
    let hwnd = HWND(handle.0 as *mut _);
    let scale = window
        .scale_factor()
        .map_err(|e| format!("could not read the scale factor: {e}"))?;

    // Region coordinates are relative to the WINDOW rect; the frontend measures
    // against the CLIENT (webview) area. Those coincide on an undecorated
    // window, but derive the delta instead of assuming it.
    let (ox, oy) = unsafe {
        let mut origin = POINT { x: 0, y: 0 };
        let mut frame = RECT::default();
        // SAFETY: `hwnd` is a live window owned by this process; both calls
        // write into stack locals we own. Failure falls back to no offset.
        if ClientToScreen(hwnd, &mut origin).as_bool() && GetWindowRect(hwnd, &mut frame).is_ok() {
            (origin.x - frame.left, origin.y - frame.top)
        } else {
            (0, 0)
        }
    };

    // Start from an empty region and OR each visible surface into it.
    // SAFETY: a 0-area rect region is valid; checked for failure below.
    let combined = unsafe { CreateRectRgn(0, 0, 0, 0) };
    if combined.is_invalid() {
        return Err("CreateRectRgn failed (out of GDI handles?)".into());
    }

    for r in rects {
        // Round OUTWARD so sub-pixel layout never shaves a visible edge off.
        let left = ((r.x - r.pad) * scale).floor() as i32 + ox;
        let top = ((r.y - r.pad) * scale).floor() as i32 + oy;
        let right = ((r.x + r.w + r.pad) * scale).ceil() as i32 + ox;
        let bottom = ((r.y + r.h + r.pad) * scale).ceil() as i32 + oy;
        let (w, h) = (right - left, bottom - top);
        if w <= 0 || h <= 0 {
            continue;
        }

        // CreateRoundRectRgn wants the ELLIPSE size, so twice the CSS radius.
        // The padding rounds off with the box, hence `radius + pad`.
        let ellipse = (((r.radius + r.pad) * 2.0 * scale).round() as i32).clamp(0, w.min(h));
        // SAFETY: coordinates are finite i32 and the ellipse is clamped to the
        // box; both calls are checked for an invalid handle before use.
        let piece = unsafe {
            if ellipse > 0 {
                CreateRoundRectRgn(left, top, right, bottom, ellipse, ellipse)
            } else {
                CreateRectRgn(left, top, right, bottom)
            }
        };
        if piece.is_invalid() {
            continue;
        }
        // SAFETY: both regions are valid, non-null GDI handles here. `piece` is
        // always deleted after the union; it is never handed to the OS.
        unsafe {
            CombineRgn(Some(combined), Some(combined), Some(piece), RGN_OR);
            let _ = DeleteObject(HGDIOBJ(piece.0));
        }
    }

    // SAFETY: `combined` is a valid region. On SUCCESS the OS takes ownership,
    // so it must not be deleted; on failure we still own it and must free it.
    let applied = unsafe { SetWindowRgn(hwnd, Some(combined), true) };
    if applied == 0 {
        unsafe {
            let _ = DeleteObject(HGDIOBJ(combined.0));
        }
        return Err("SetWindowRgn failed".into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn apply(_window: &WebviewWindow, _rects: &[HitRect]) -> Result<(), String> {
    // Shaped windows are a Windows concern; Islet only ships on Windows. Report
    // success so the frontend's publish loop is a no-op in cross-platform dev.
    Ok(())
}
