//! Hide the island from screen capture / recording (Spec 10).
//!
//! Uses `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`. This is a
//! per-window toggle and only works while the Desktop Window Manager (DWM) is
//! composing (always true on Win10 2004+/Win11). `WDA_EXCLUDEFROMCAPTURE` makes
//! the window invisible to screenshots/recordings while still visible to the
//! user; `WDA_NONE` turns it back off.
//!
//! HARDWARE VERIFICATION PENDING (docs/windows-notes.md): confirm the notch
//! disappears from Snipping Tool / screen share, that the toggle reverses, and
//! that transparency does not interact badly with the affinity flag.

#[cfg(windows)]
pub fn set_excluded_from_capture(window: &tauri::WebviewWindow, excluded: bool) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
    };

    // Get the raw Win32 HWND from the Tauri window.
    let hwnd = window
        .hwnd()
        .map_err(|e| format!("could not get window handle: {e}"))?;
    let hwnd = HWND(hwnd.0 as *mut _);

    let affinity = if excluded { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
    // SAFETY: hwnd is a live top-level window owned by this process; the flag is
    // one of the documented constants. Failure returns an error, never panics.
    unsafe {
        SetWindowDisplayAffinity(hwnd, affinity)
            .map_err(|e| format!("SetWindowDisplayAffinity failed: {e}"))
    }
}

#[cfg(not(windows))]
pub fn set_excluded_from_capture(_window: &tauri::WebviewWindow, _excluded: bool) -> Result<(), String> {
    // No-op off Windows (the feature is Windows-only); report success so the
    // setting toggles cleanly in dev on other platforms.
    Ok(())
}
