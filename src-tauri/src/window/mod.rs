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

pub const ISLAND_LABEL: &str = "island";

/// The monitor the user chose for the pill, by its OS name (e.g. "\\.\DISPLAY2").
/// `None` means "primary". Held in app state; Spec 2 persists it to settings.
#[derive(Default)]
pub struct MonitorChoice(pub Mutex<Option<String>>);

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
    // Re-center on the (possibly new) active monitor, keeping current size.
    let open = is_open(window);
    position_top_center(window, open)
}

/// True when the window is currently at (roughly) the open size. Used so a
/// re-place keeps the current open/closed footprint.
fn is_open(window: &WebviewWindow) -> bool {
    match window.inner_size() {
        Ok(size) => {
            let scale = window.scale_factor().unwrap_or(1.0);
            let logical_h = size.height as f64 / scale;
            logical_h > (PILL.closed_height + PILL.open_height) / 2.0
        }
        Err(_) => false,
    }
}

/// Center the pill horizontally and pin it to the top of the active monitor.
/// Works in logical units so it is correct regardless of DPI scale.
pub fn position_top_center(window: &WebviewWindow, open: bool) -> tauri::Result<()> {
    let Some(monitor) = active_monitor(window) else {
        // No monitor info: leave the window where it is rather than guessing.
        return Ok(());
    };

    let scale = monitor.scale_factor();
    // Monitor position/size are physical; convert to logical for math.
    let mon_pos = monitor.position().to_logical::<f64>(scale);
    let mon_size = monitor.size().to_logical::<f64>(scale);

    let (w, h) = if open {
        (PILL.open_width, PILL.open_height)
    } else {
        (PILL.closed_width, PILL.closed_height)
    };

    window.set_size(LogicalSize::new(w, h))?;

    let x = mon_pos.x + (mon_size.width - w) / 2.0;
    let y = mon_pos.y + PILL.top_margin;
    window.set_position(LogicalPosition::new(x, y))?;
    Ok(())
}

/// When closed, the pill must not eat clicks or steal focus; when open, it must
/// accept clicks. This is the core of the spike's "click-through" proof.
pub fn set_click_through(window: &WebviewWindow, click_through: bool) -> tauri::Result<()> {
    window.set_ignore_cursor_events(click_through)
}

/// Apply the full closed-state setup: small, top-center, on top.
///
/// Spike finding: a click-through window (`ignore_cursor_events(true)`) cannot
/// receive the mouse-enter that opens the panel, so hover-to-open and full
/// click-through are mutually exclusive on one window. For the spike we keep
/// the closed pill INTERACTIVE so hover works and can be verified. Making the
/// idle pill truly click-through (option 1 in docs/windows-notes.md: a thin
/// always-on hover strip over an otherwise pass-through window) is the next
/// refinement in Spec 1, once hover is confirmed on real hardware.
pub fn apply_closed_state(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_always_on_top(true)?;
    position_top_center(window, false)?;
    set_click_through(window, false)?;
    Ok(())
}

/// Apply the open-state setup: larger panel, clickable, still on top.
pub fn apply_open_state(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_always_on_top(true)?;
    position_top_center(window, true)?;
    set_click_through(window, false)?;
    Ok(())
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
    let open_now = is_open(&win);
    if open_now {
        apply_closed_state(&win)?;
    } else {
        apply_open_state(&win)?;
        let _ = win.set_focus();
    }
    // Tell the frontend to match. Payload = the NEW open state.
    use tauri::Emitter;
    let _ = win.emit("islet://toggle-open", !open_now);
    Ok(())
}
