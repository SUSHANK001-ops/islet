//! Global hotkey to toggle the island from anywhere (even when unfocused).
//! Default: Ctrl+Shift+Space. Conflicts fail gracefully (no crash).

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::window;

/// The default toggle shortcut. Spec 2 will make this user-configurable.
pub fn default_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)
}

/// Register the toggle hotkey. Returns Ok(false) if the combo is already taken
/// by another app (so the caller can surface a friendly message) instead of
/// treating a conflict as a fatal error. Concrete `Wry` runtime (see tray.rs).
pub fn register(app: &AppHandle) -> Result<bool, String> {
    let shortcut = default_shortcut();
    let gs = app.global_shortcut();

    // If somehow already registered (hot reload), treat as success.
    if gs.is_registered(shortcut) {
        return Ok(true);
    }

    match gs.on_shortcut(shortcut, move |app, _shortcut, event| {
        // Fire on key press only, not release, to avoid a double toggle.
        if event.state() == ShortcutState::Pressed {
            let _ = window::toggle(app);
        }
    }) {
        Ok(()) => Ok(true),
        // A conflict (combo owned by another program) is not fatal.
        Err(e) => {
            eprintln!("islet: could not register toggle hotkey: {e}");
            Ok(false)
        }
    }
}
