//! Windows-only platform helpers.
//! - `is_fullscreen_app_active`: foreground-window fullscreen check (spike).
//! - `session`: lock/unlock + sleep/resume notifications (Spec 3 focus pause).
//!
//! AGENTS.md prefers events over polling. True fullscreen "enter/exit" is not a
//! single Windows event; the common, documented approach is to inspect the
//! foreground window's rect against its monitor. The `is_fullscreen_app_active`
//! one-shot check can later be called from a low-rate, display-change-driven
//! timer. The reason it is not a tight poll is recorded in docs/windows-notes.md.

pub mod capture;
pub mod media;
pub mod session;
pub mod taskbar;

#[cfg(windows)]
pub fn is_fullscreen_app_active() -> bool {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetDesktopWindow, GetForegroundWindow, GetShellWindow, GetWindowRect,
    };

    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0 == std::ptr::null_mut() {
            return false;
        }

        // The desktop and shell (taskbar/Progman) are not "a fullscreen app".
        if hwnd == GetDesktopWindow() || hwnd == GetShellWindow() {
            return false;
        }

        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return false;
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return false;
        }

        // The window is fullscreen if it fully covers the monitor's full area
        // (rcMonitor, not the work area which excludes the taskbar).
        let m = info.rcMonitor;
        rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom
    }
}

/// Non-Windows fallback so the project still compiles for tests/CI elsewhere.
#[cfg(not(windows))]
pub fn is_fullscreen_app_active() -> bool {
    false
}

/// Start the game-mode / fullscreen watcher (Spec 10). There is no single
/// Windows "entered fullscreen" event, so this samples the foreground-window
/// fullscreen state on a slow cadence and emits `islet://fullscreen-changed`
/// only when it CHANGES. The frontend uses the event to hide the panel and stop
/// the character animation; the caller also pauses the focus timer on enter.
///
/// Polling rationale (AGENTS.md hard rule #2: poll only when no event exists,
/// at the slowest safe rate, and write why): no fullscreen event exists in the
/// Tauri/Win32 surface we use. 2s is slow enough to be nearly free and fast
/// enough that a game going fullscreen hides the notch promptly. Recorded in
/// docs/windows-notes.md.
pub fn start_fullscreen_watch(app: tauri::AppHandle) {
    use tauri::Emitter;
    std::thread::spawn(move || {
        let mut last = false;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let now = is_fullscreen_app_active();
            if now != last {
                last = now;
                let _ = app.emit("islet://fullscreen-changed", now);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    // On non-Windows (CI/dev machines without a desktop), the fallback must be
    // a stable `false` so the island never hides itself by accident.
    #[cfg(not(windows))]
    #[test]
    fn fallback_reports_no_fullscreen() {
        assert_eq!(is_fullscreen_app_active(), false);
    }

    // On Windows the call must not panic even with no app in the foreground.
    #[cfg(windows)]
    #[test]
    fn windows_check_does_not_panic() {
        let _ = is_fullscreen_app_active();
    }
}
