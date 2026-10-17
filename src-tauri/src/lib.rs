//! Islet library entry. `main.rs` just calls `run()`.
//!
//! Spec 1 (Shell) wiring: island window, tray, global hotkey, monitor choice,
//! launch-at-startup (via plugin), plus the frontend command allow-list.

mod app_config;
mod commands;
mod platform;
mod shortcut;
mod tray;
mod window;

use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // autostart: launch-at-startup toggle. "--minimized" so a startup
        // launch does not pop the panel. MacosLauncher is required by the API
        // even on Windows; it is a no-op here.
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        // global-shortcut: the toggle hotkey plumbing.
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // The chosen monitor (None = primary) lives in app state.
        .manage(window::MonitorChoice::default())
        .invoke_handler(tauri::generate_handler![
            commands::set_panel_open,
            commands::get_spike_report,
            commands::list_monitors,
            commands::set_monitor
        ])
        .setup(|app| {
            // Show the pill first (startup rule), then wire integrations.
            if let Some(win) = window::island(app.handle()) {
                if let Err(e) = window::apply_closed_state(&win) {
                    eprintln!("islet: failed to apply closed window state: {e}");
                }
            } else {
                eprintln!("islet: island window '{}' not found", window::ISLAND_LABEL);
            }

            // Tray icon + menu. Non-fatal if it fails.
            if let Err(e) = tray::build(app.handle()) {
                eprintln!("islet: failed to build tray: {e}");
            }

            // Toggle hotkey. A conflict is reported to the frontend, not fatal.
            match shortcut::register(app.handle()) {
                Ok(true) => {}
                Ok(false) => {
                    use tauri::Emitter;
                    let _ = app.emit("islet://hotkey-conflict", shortcut_label());
                }
                Err(e) => eprintln!("islet: hotkey error: {e}"),
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Islet");
}

/// Human-readable label of the default hotkey, for the conflict message.
fn shortcut_label() -> &'static str {
    "Ctrl+Shift+Space"
}
