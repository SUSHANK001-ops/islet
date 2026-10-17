//! Windows-only platform helpers.
//! - `is_fullscreen_app_active`: foreground-window fullscreen check (spike).
//! - `session`: lock/unlock + sleep/resume notifications (Spec 3 focus pause).
//!
//! AGENTS.md prefers events over polling. True fullscreen "enter/exit" is not a
//! single Windows event; the common, documented approach is to inspect the
//! foreground window's rect against its monitor. The `is_fullscreen_app_active`
//! one-shot check can later be called from a low-rate, display-change-driven
//! timer. The reason it is not a tight poll is recorded in docs/windows-notes.md.

pub mod session;

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
