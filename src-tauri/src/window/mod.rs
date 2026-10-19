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

/// Tracks whether the frontend currently has something interactive showing
/// (pill hovered / panel / flyout open). Drives click-through.
#[derive(Default)]
pub struct InteractiveState(pub Mutex<bool>);

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

    let x = match free_position(window) {
        Some(p) => {
            // p is the desired PILL top-left; shift left by side_gap so the pill
            // (centered in the window) lands there. Clamp to keep on-screen.
            let want = mon_pos.x + p.x - side_gap;
            let max_x = mon_pos.x + (mon_size.width - WINDOW_W).max(-side_gap);
            want.clamp(mon_pos.x - side_gap, max_x)
        }
        None => match notch_position(window) {
            NotchPosition::Left => mon_pos.x + edge - side_gap,
            NotchPosition::Center => mon_pos.x + (mon_size.width - WINDOW_W) / 2.0,
            NotchPosition::Right => mon_pos.x + mon_size.width - pill_w - edge - side_gap,
        },
    };
    let y = mon_pos.y + PILL.top_margin;
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

/// Toggle whole-window click-through. The frontend calls `set_panel_open` with
/// whether anything interactive is showing: when nothing is up, the whole
/// transparent window passes clicks through to apps behind it; when the pill is
/// hovered or a panel/flyout is open, it accepts clicks.
pub fn set_click_through(window: &WebviewWindow, click_through: bool) -> tauri::Result<()> {
    if let Some(state) = window.try_state::<InteractiveState>() {
        if let Ok(mut g) = state.0.lock() {
            *g = !click_through;
        }
    }
    window.set_ignore_cursor_events(click_through)
}

/// Closed/idle state: window placed + on top. It stays INTERACTIVE so hover can
/// open the pill (the known one-window hover-vs-clickthrough tradeoff); the
/// transparent empty area is small relative to the pill at the top edge.
pub fn apply_closed_state(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_always_on_top(true)?;
    place(window)?;
    set_click_through(window, false)?;
    Ok(())
}

/// Open state: same fixed window, interactive, on top.
pub fn apply_open_state(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_always_on_top(true)?;
    place(window)?;
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
    // The frontend owns the visual open state; read whether it is currently
    // interactive/open from our state and flip it.
    let open_now = win
        .try_state::<InteractiveState>()
        .and_then(|s| s.0.lock().ok().map(|g| *g))
        .unwrap_or(false);
    if !open_now {
        let _ = win.set_focus();
    }
    use tauri::Emitter;
    let _ = win.emit("islet://toggle-open", !open_now);
    Ok(())
}
