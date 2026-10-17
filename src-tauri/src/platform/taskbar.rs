//! Taskbar progress for the focus timer (Spec 10).
//!
//! Tauri has no built-in taskbar-progress API (feature requests #4386/#4208),
//! so we call the Win32 COM `ITaskbarList3::SetProgressValue` /
//! `SetProgressState` directly.
//!
//! KNOWN LIMITATION (docs/windows-notes.md): the island window is created with
//! `skipTaskbar: true`, so it has no taskbar button for a progress overlay to
//! attach to. This code is correct, but for the progress to be VISIBLE the app
//! needs a taskbar-visible window. Until that is decided on hardware, calling
//! these functions is harmless (the COM calls succeed but nothing shows). The
//! decision + result must be recorded in docs/windows-notes.md before this is
//! considered done.

/// Progress state the focus timer maps onto the taskbar button.
#[derive(Clone, Copy, Debug)]
pub enum Progress {
    /// No progress shown (idle / reset).
    None,
    /// A normal determinate bar, fraction 0.0..=1.0 complete.
    Normal(f64),
    /// Paused (amber), fraction 0.0..=1.0 complete.
    Paused(f64),
}

#[cfg(windows)]
pub fn set(window: &tauri::WebviewWindow, progress: Progress) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
    use windows::Win32::UI::Shell::{
        ITaskbarList3, TaskbarList, TBPF_NOPROGRESS, TBPF_NORMAL, TBPF_PAUSED,
    };

    let hwnd = window
        .hwnd()
        .map_err(|e| format!("could not get window handle: {e}"))?;
    let hwnd = HWND(hwnd.0 as *mut _);

    // Clamp a fraction to 0..=1 and scale to a 0..=1000 completed/total pair so
    // the bar has smooth resolution.
    let scaled = |frac: f64| -> (u64, u64) {
        let f = frac.clamp(0.0, 1.0);
        ((f * 1000.0).round() as u64, 1000u64)
    };

    // SAFETY: standard COM creation of the shell TaskbarList object. Every call
    // returns an HRESULT mapped to Result; nothing here can panic.
    unsafe {
        let list: ITaskbarList3 =
            CoCreateInstance(&TaskbarList, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        list.HrInit().map_err(|e| e.to_string())?;

        match progress {
            Progress::None => {
                list.SetProgressState(hwnd, TBPF_NOPROGRESS)
                    .map_err(|e| e.to_string())?;
            }
            Progress::Normal(frac) => {
                list.SetProgressState(hwnd, TBPF_NORMAL)
                    .map_err(|e| e.to_string())?;
                let (c, t) = scaled(frac);
                list.SetProgressValue(hwnd, c, t)
                    .map_err(|e| e.to_string())?;
            }
            Progress::Paused(frac) => {
                list.SetProgressState(hwnd, TBPF_PAUSED)
                    .map_err(|e| e.to_string())?;
                let (c, t) = scaled(frac);
                list.SetProgressValue(hwnd, c, t)
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn set(_window: &tauri::WebviewWindow, _progress: Progress) -> Result<(), String> {
    // No taskbar off Windows; report success so callers stay simple.
    Ok(())
}
