//! System tray icon + menu (Show/Hide, Settings, Quit).
//! Left-click toggles the island. Uses Tauri's built-in tray-icon.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter,
};

use crate::window;

/// Build the tray and attach its menu + click handlers. Called once at setup.
/// Uses the concrete `Wry` runtime (the only one Islet uses) to satisfy the
/// tray/menu trait bounds without threading a generic runtime everywhere.
pub fn build(app: &AppHandle) -> tauri::Result<()> {
    // Menu items. Labels are English here; the tray is OS-native chrome, so the
    // frontend i18n map does not reach it. Kept short and clear.
    let show = MenuItem::with_id(app, "show", "Show / Hide", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &quit])?;

    TrayIconBuilder::with_id("islet-tray")
        .icon(app.default_window_icon().cloned().ok_or_else(|| {
            tauri::Error::AssetNotFound("default window icon".into())
        })?)
        .tooltip("Islet")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                let _ = window::toggle(app);
            }
            "settings" => {
                // Open the panel and ask the frontend to show the Settings tab.
                if let Some(win) = window::island(app) {
                    let _ = window::apply_open_state(&win);
                    let _ = win.set_focus();
                    let _ = win.emit("islet://open-settings", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click (press+release) toggles the island.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = window::toggle(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
