//! Session-lock and power (sleep/resume) notifications on Windows.
//!
//! Windows has no single "locked" event in Tauri, so we create a message-only
//! window and register for `WM_WTSSESSION_CHANGE` (lock/unlock) and listen for
//! `WM_POWERBROADCAST` (suspend/resume). This is event-driven, not polling
//! (AGENTS.md hard rule #2). The window runs its own message loop on a
//! dedicated thread and forwards simple events through a channel.
//!
//! If registration fails (unusual), we log and the focus timer simply does not
//! auto-pause on lock; that degraded behavior is documented in
//! docs/windows-notes.md rather than crashing.

use std::sync::mpsc::Sender;

/// Events the listener forwards to the app.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionEvent {
    /// Workstation locked or the machine is going to sleep -> pause.
    Pause,
    /// Workstation unlocked or the machine resumed -> resume.
    Resume,
}

#[cfg(windows)]
mod imp {
    use super::{SessionEvent, Sender};
    use std::cell::RefCell;
    use windows::core::w;
    use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Power::RegisterSuspendResumeNotification;
    use windows::Win32::System::RemoteDesktop::{
        WTSRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
        DEVICE_NOTIFY_WINDOW_HANDLE, HWND_MESSAGE, MSG, PBT_APMRESUMEAUTOMATIC, PBT_APMSUSPEND,
        WINDOW_EX_STYLE, WINDOW_STYLE, WM_POWERBROADCAST, WM_WTSSESSION_CHANGE, WNDCLASSW,
        WTS_SESSION_LOCK, WTS_SESSION_UNLOCK,
    };

    // Each message-only window stashes its Sender in thread-local storage so
    // the window proc (a plain fn) can reach it.
    thread_local! {
        static SENDER: RefCell<Option<Sender<SessionEvent>>> = RefCell::new(None);
    }

    unsafe extern "system" fn wndproc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_WTSSESSION_CHANGE => {
                let evt = match wparam.0 as u32 {
                    WTS_SESSION_LOCK => Some(SessionEvent::Pause),
                    WTS_SESSION_UNLOCK => Some(SessionEvent::Resume),
                    _ => None,
                };
                if let Some(e) = evt {
                    SENDER.with(|s| {
                        if let Some(tx) = s.borrow().as_ref() {
                            let _ = tx.send(e);
                        }
                    });
                }
                LRESULT(0)
            }
            WM_POWERBROADCAST => {
                let evt = match wparam.0 as u32 {
                    PBT_APMSUSPEND => Some(SessionEvent::Pause),
                    PBT_APMRESUMEAUTOMATIC => Some(SessionEvent::Resume),
                    _ => None,
                };
                if let Some(e) = evt {
                    SENDER.with(|s| {
                        if let Some(tx) = s.borrow().as_ref() {
                            let _ = tx.send(e);
                        }
                    });
                }
                LRESULT(1)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    /// Create the message-only window, register for notifications, and pump
    /// messages forever. Runs on its own thread; returns only on failure.
    pub fn run(tx: Sender<SessionEvent>) {
        unsafe {
            SENDER.with(|s| *s.borrow_mut() = Some(tx));

            let hmodule = match GetModuleHandleW(None) {
                Ok(h) => h,
                Err(e) => {
                    eprintln!("islet: session listener GetModuleHandle failed: {e}");
                    return;
                }
            };
            // HINSTANCE and HMODULE share the same handle value.
            let hinstance: windows::Win32::Foundation::HINSTANCE =
                windows::Win32::Foundation::HINSTANCE(hmodule.0);

            let class_name = w!("IsletSessionListener");
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wndproc),
                hInstance: hinstance,
                lpszClassName: class_name,
                ..Default::default()
            };
            // RegisterClassW returns 0 on failure.
            if RegisterClassW(&wc) == 0 {
                eprintln!("islet: session listener RegisterClass failed");
                return;
            }

            let hwnd = match CreateWindowExW(
                WINDOW_EX_STYLE(0),
                class_name,
                w!("islet-session"),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(hinstance),
                None,
            ) {
                Ok(h) => h,
                Err(e) => {
                    eprintln!("islet: session listener CreateWindow failed: {e}");
                    return;
                }
            };

            // Lock/unlock notifications for this session.
            if WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION).is_err() {
                eprintln!("islet: WTSRegisterSessionNotification failed (lock pause disabled)");
            }
            // Suspend/resume notifications. The window handle doubles as the
            // recipient HANDLE when the flag is DEVICE_NOTIFY_WINDOW_HANDLE.
            if RegisterSuspendResumeNotification(HANDLE(hwnd.0), DEVICE_NOTIFY_WINDOW_HANDLE)
                .is_err()
            {
                eprintln!("islet: RegisterSuspendResumeNotification failed (sleep pause disabled)");
            }

            // Standard message pump. Blocks this thread.
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, Some(hwnd), 0, 0).as_bool() {
                DispatchMessageW(&msg);
            }
        }
    }
}

/// Start the session listener on a background thread. Non-Windows is a no-op.
#[cfg(windows)]
pub fn start(tx: Sender<SessionEvent>) {
    std::thread::spawn(move || imp::run(tx));
}

#[cfg(not(windows))]
pub fn start(_tx: Sender<SessionEvent>) {
    // No session/power notifications off Windows; focus simply never auto-pauses.
}
