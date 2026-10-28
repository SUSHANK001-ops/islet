//! Island window control: position at top-center, DPI-aware sizing, and
//! click-through toggling. This is the source of truth for window geometry;
//! the frontend only asks via commands.
//!
//! Why Rust-side: window placement must be correct across monitors and DPI
//! scales, and AGENTS.md makes the Rust side authoritative. Doing it here also
//! avoids granting the frontend broad window-management permissions.

use std::sync::Mutex;

use tauri::{LogicalPosition, LogicalSize, Manager, Monitor, WebviewWindow};

use crate::app_config::PILL;

/// Per-region hit testing, so the transparent part of the window does not
/// swallow clicks meant for the apps behind it.
pub mod hit_region;

pub const ISLAND_LABEL: &str = "island";

/// The monitor the user chose for the pill, by its OS name (e.g. "\\.\DISPLAY2").
/// `None` means "primary". Held in app state; Spec 2 persists it to settings.
#[derive(Default)]
pub struct MonitorChoice(pub Mutex<Option<String>>);

/// Where the notch sits along the top edge. User-settable; persisted.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum NotchPosition {
    Left,
    Center,
    Right,
}

impl NotchPosition {
    pub fn parse(s: &str) -> Self {
        match s {
            "left" => NotchPosition::Left,
            "right" => NotchPosition::Right,
            _ => NotchPosition::Center,
        }
    }
}

/// Current notch horizontal position, held in app state.
pub struct NotchPositionState(pub Mutex<NotchPosition>);

impl Default for NotchPositionState {
    fn default() -> Self {
        NotchPositionState(Mutex::new(NotchPosition::Center))
    }
}

/// A free-dragged position (Spec 8 "place anywhere"). When set, it overrides the
/// left/center/right preset. Stored in LOGICAL pixels relative to the active
/// monitor's work-area origin so it stays correct across DPI changes. `None`
/// means "use the left/center/right preset".
#[derive(Clone, Copy, PartialEq)]
pub struct FreePosition {
    pub x: f64,
    pub y: f64,
}

/// Current free position, held in app state. Seeded from settings on launch.
#[derive(Default)]
pub struct FreePositionState(pub Mutex<Option<FreePosition>>);

/// Pick the monitor the pill should live on. Honors the user's choice if that
/// monitor is still connected; otherwise falls back to primary (then current).
/// Graceful fallback matters: a chosen monitor can be unplugged at any time.
pub fn active_monitor(window: &WebviewWindow) -> Option<Monitor> {
    // Honor an explicit choice when the named monitor is still present.
    if let Some(app) = window.try_state::<MonitorChoice>() {
        if let Ok(guard) = app.0.lock() {
            if let Some(name) = guard.as_ref() {
                if let Ok(monitors) = window.available_monitors() {
                    if let Some(m) = monitors
                        .into_iter()
                        .find(|m| m.name().map(|n| n == name).unwrap_or(false))
                    {
                        return Some(m);
                    }
                }
            }
        }
    }
    // primary_monitor is the stable default; fall back to current if needed.
    if let Ok(Some(primary)) = window.primary_monitor() {
        return Some(primary);
    }
    window.current_monitor().ok().flatten()
}

/// Names of all connected monitors, for the monitor-choice setting UI.
pub fn monitor_names(window: &WebviewWindow) -> Vec<String> {
    window
        .available_monitors()
        .map(|list| {
            list.into_iter()
                .map(|m| m.name().cloned().unwrap_or_default())
                .collect()
        })
        .unwrap_or_default()
}

/// Set the preferred monitor (by name, or `None` for primary) and re-place.
pub fn set_monitor_choice(window: &WebviewWindow, name: Option<String>) -> tauri::Result<()> {
    if let Some(state) = window.try_state::<MonitorChoice>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = name;
        }
    }
    place(window)
}

/// The fixed window footprint (logical px). The window is ONE constant size big
/// enough to hold the pill, a fully-open panel, and a downward flyout; the
/// frontend positions everything with CSS inside this transparent canvas and
/// toggles click-through so the empty area passes clicks through. This avoids
/// per-state OS resizing, which was clipping the panel and flyouts.
const WINDOW_W: f64 = 640.0;
const WINDOW_H: f64 = 720.0;

/// Whether the panel is currently OPEN.
///
/// WHY this replaced the old `InteractiveState`: that flag was written as
/// `!click_through`, and both `apply_open_state` and `apply_closed_state` called
/// `set_click_through(window, false)`, so it was stuck at `true` forever.
/// `toggle()` read it as "is the panel open", always saw `true`, and therefore
/// always emitted "close" - which is why the tray icon and Ctrl+Shift+Space
/// could never OPEN the island, only close it.
#[derive(Default)]
pub struct PanelOpenState(pub Mutex<bool>);

/// Read the current notch position from app state (defaults to Center).
fn notch_position(window: &WebviewWindow) -> NotchPosition {
    window
        .try_state::<NotchPositionState>()
        .and_then(|s| s.0.lock().ok().map(|g| *g))
        .unwrap_or(NotchPosition::Center)
}

/// Place the ONE fixed-size window at the top of the active monitor, aligned to
/// the chosen notch position (or a free-dragged spot). The window stays this
/// size always; the frontend draws the pill/panel/flyouts inside it with CSS.
/// Logical units, so correct at any DPI.
pub fn place(window: &WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = active_monitor(window) else {
        return Ok(());
    };
    let scale = monitor.scale_factor();
    let mon_pos = monitor.position().to_logical::<f64>(scale);
    let mon_size = monitor.size().to_logical::<f64>(scale);

    // Keep the fixed size (DPI-correct).
    window.set_size(LogicalSize::new(WINDOW_W, WINDOW_H))?;

    // The window is wider than the pill; the pill is centered WITHIN the window
    // by CSS. So to put the pill at the monitor's left/center/right, we offset
    // the window by the gap between the window width and the pill width.
    let pill_w = PILL.closed_width;
    let side_gap = (WINDOW_W - pill_w) / 2.0;
    let edge = 24.0_f64;

    let free = free_position(window);

    let x = match free {
        Some(p) => {
            // p is the desired PILL top-left; shift left by side_gap so the pill
            // (centered in the window) lands there. Clamp against the PILL, not
            // the oversized transparent window, so the notch can still be placed
            // flush against either screen edge.
            let want = mon_pos.x + p.x - side_gap;
            let min_x = mon_pos.x - side_gap;
            let max_x = mon_pos.x + mon_size.width - pill_w - side_gap;
            want.clamp(min_x, max_x.max(min_x))
        }
        None => match notch_position(window) {
            NotchPosition::Left => mon_pos.x + edge - side_gap,
            NotchPosition::Center => mon_pos.x + (mon_size.width - WINDOW_W) / 2.0,
            NotchPosition::Right => mon_pos.x + mon_size.width - pill_w - edge - side_gap,
        },
    };

    // Vertical placement. The pill sits at the TOP of the window (CSS
    // margin-top: 0), so the window's y IS the pill's y.
    //
    // This used to be hardcoded to `mon_pos.y + PILL.top_margin`, which silently
    // threw away the persisted Y: dragging the notch downwards appeared to work,
    // saved a Y, and then snapped back to the top edge on the next placement.
    let y = match free {
        Some(p) => {
            // Keep the whole window on-screen where the monitor is tall enough,
            // so an opened panel is never clipped; on a short monitor fall back
            // to keeping the pill itself visible.
            let room = (mon_size.height - WINDOW_H).max(0.0);
            let max_y = if room > 0.0 {
                mon_pos.y + room
            } else {
                mon_pos.y + (mon_size.height - PILL.closed_height).max(0.0)
            };
            (mon_pos.y + p.y).clamp(mon_pos.y, max_y)
        }
        None => mon_pos.y + PILL.top_margin,
    };

    window.set_position(LogicalPosition::new(x, y))?;
    Ok(())
}

/// Read the current free position from app state (None = use a preset).
fn free_position(window: &WebviewWindow) -> Option<FreePosition> {
    window
        .try_state::<FreePositionState>()
        .and_then(|s| s.0.lock().ok().map(|g| *g))
        .flatten()
}

/// Set (or clear with `None`) the free-dragged position and re-place the pill.
/// The incoming x/y are logical pixels relative to the active monitor's origin.
pub fn set_free_position(window: &WebviewWindow, pos: Option<FreePosition>) -> tauri::Result<()> {
    if let Some(state) = window.try_state::<FreePositionState>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = pos;
        }
    }
    place(window)
}

/// Current pill top-left in LOGICAL pixels relative to the active monitor's
/// work-area origin. Used to persist a drag. Returns (0,0) if unknown.
pub fn current_offset(window: &WebviewWindow) -> FreePosition {
    let Some(monitor) = active_monitor(window) else {
        return FreePosition { x: 0.0, y: 0.0 };
    };
    let scale = monitor.scale_factor();
    let mon_pos = monitor.position().to_logical::<f64>(scale);
    // The pill sits centered inside the window, so its left edge is the window
    // left + side_gap. Report the PILL offset so it round-trips through place().
    let side_gap = (WINDOW_W - PILL.closed_width) / 2.0;
    match window.outer_position() {
        Ok(phys) => {
            let p = phys.to_logical::<f64>(scale);
            FreePosition {
                x: (p.x - mon_pos.x + side_gap).max(0.0),
                y: (p.y - mon_pos.y).max(0.0),
            }
        }
        Err(_) => FreePosition { x: 0.0, y: 0.0 },
    }
}

/// Set the notch horizontal position and re-place the pill immediately.
pub fn set_notch_position(window: &WebviewWindow, pos: NotchPosition) -> tauri::Result<()> {
    if let Some(state) = window.try_state::<NotchPositionState>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = pos;
        }
    }
    place(window)
}

/// Record whether the panel is open. Read by `toggle()` (tray / hotkey).
fn set_panel_open_flag(window: &WebviewWindow, open: bool) {
    if let Some(state) = window.try_state::<PanelOpenState>() {
        if let Ok(mut g) = state.0.lock() {
            *g = open;
        }
    }
}

/// Closed/idle state: window placed + on top.
///
/// The window stays a fixed, oversized transparent canvas; what stops it from
/// swallowing clicks is the hit region (see `hit_region`), which the frontend
/// keeps pinned to whatever is actually visible. Nothing here toggles
/// whole-window click-through, because doing so also kills hover and the pill
/// could never open.
pub fn apply_closed_state(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_always_on_top(true)?;
    place(window)?;
    set_panel_open_flag(window, false);
    Ok(())
}

/// Open state: same fixed window, on top.
pub fn apply_open_state(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_always_on_top(true)?;
    place(window)?;
    set_panel_open_flag(window, true);
    Ok(())
}

/// Apply a conservative starting hit region covering just the closed notch.
///
/// WHY: the frontend publishes exact rects, but only after it has mounted and
/// measured. Until then the window would still be one big click-swallowing
/// rectangle, so seed the notch footprint immediately at startup. Coordinates
/// are window-relative logical px, matching what the frontend sends; the pill
/// is centered horizontally by CSS and sits flush at the top.
pub fn seed_hit_region(window: &WebviewWindow) {
    let side_gap = (WINDOW_W - PILL.closed_width) / 2.0;
    let rect = hit_region::HitRect {
        x: side_gap,
        y: 0.0,
        w: PILL.closed_width,
        h: PILL.closed_height,
        radius: 16.0,
        // Enough to keep the notch's drop shadow from being clipped.
        pad: 14.0,
    };
    if let Err(e) = hit_region::set(window, vec![rect]) {
        // Non-fatal: without a region the window is over-eager about clicks,
        // which is worse UX but still a working app.
        eprintln!("islet: could not seed the hit region: {e}");
    }
}

/// Count of connected monitors, used by the spike report.
pub fn monitor_count(window: &WebviewWindow) -> usize {
    window.available_monitors().map(|m| m.len()).unwrap_or(0)
}

/// Resolve the island window from any Manager (app handle or window).
pub fn island<M: Manager<tauri::Wry>>(manager: &M) -> Option<WebviewWindow> {
    manager.get_webview_window(ISLAND_LABEL)
}

/// Toggle the island open/closed from outside the webview (tray, hotkey).
///
/// The frontend owns the visual open/closed state, so we tell it to toggle via
/// an event and also apply the matching window footprint. Emitting an event
/// (not calling a command) keeps this one-directional and avoids the frontend
/// needing extra command permissions.
pub fn toggle<M: Manager<tauri::Wry>>(manager: &M) -> tauri::Result<()> {
    let Some(win) = island(manager) else {
        return Ok(());
    };
    // The frontend owns the visual open state; read the last state we applied
    // and flip it.
    let open_now = win
        .try_state::<PanelOpenState>()
        .and_then(|s| s.0.lock().ok().map(|g| *g))
        .unwrap_or(false);
    if !open_now {
        let _ = win.set_focus();
    }
    use tauri::Emitter;
    let _ = win.emit("islet://toggle-open", !open_now);
    Ok(())
}
