//! Island window control: position at top-center, DPI-aware sizing, and
//! click-through toggling. This is the source of truth for window geometry;
//! the frontend only asks via commands.
//!
//! Why Rust-side: window placement must be correct across monitors and DPI
//! scales, and AGENTS.md makes the Rust side authoritative. Doing it here also
//! avoids granting the frontend broad window-management permissions.

use tauri::{LogicalPosition, LogicalSize, Manager, Monitor, WebviewWindow};

use crate::app_config::PILL;

pub const ISLAND_LABEL: &str = "island";

/// Pick the monitor the pill should live on. For the spike we use the primary
/// monitor; monitor choice becomes a setting in Spec 1 (Shell).
pub fn active_monitor(window: &WebviewWindow) -> Option<Monitor> {
    // primary_monitor is the stable default; fall back to current if needed.
    if let Ok(Some(primary)) = window.primary_monitor() {
        return Some(primary);
    }
    window.current_monitor().ok().flatten()
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
