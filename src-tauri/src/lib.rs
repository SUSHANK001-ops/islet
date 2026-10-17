//! Islet library entry. `main.rs` just calls `run()`.
//!
//! Spec 2 (Storage, settings, modules) wiring on top of Spec 1: versioned JSON
//! store, settings persistence, activity log, module registry + hub, plus the
//! frontend command allow-list. Rust owns all state and storage.

mod app_config;
mod commands;
mod modules;
mod platform;
mod scheduler;
mod shortcut;
mod store;
mod tray;
mod window;

use std::sync::Arc;

use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

use modules::example::ExampleModule;
use modules::focus::engine::FocusConfig;
use modules::focus::{FocusHandle, FocusModule};
use modules::hub::Hub;
use modules::registry::Registry;
use scheduler::Scheduler;
use store::WriteDebouncer;

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
        // notification: Windows toast when a focus round ends.
        .plugin(tauri_plugin_notification::init())
        // opener: launch YouTube Music in the default browser (Media tab).
        .plugin(tauri_plugin_opener::init())
        // App state: monitor choice, write debouncer, hub, registry, scheduler.
        .manage(window::MonitorChoice::default())
        .manage(window::NotchPositionState::default())
        .manage(WriteDebouncer::default())
        .manage(Hub::default())
        .manage(Registry::default())
        .manage(Scheduler::default())
        .invoke_handler(tauri::generate_handler![
            commands::set_panel_open,
            commands::get_spike_report,
            commands::list_monitors,
            commands::set_monitor,
            commands::set_notch_position,
            commands::load_settings,
            commands::save_settings,
            commands::flush_settings,
            commands::append_activity,
            commands::read_activity_day,
            commands::list_modules,
            commands::set_module_enabled,
            commands::get_hub,
            commands::focus_start,
            commands::focus_pause,
            commands::focus_resume,
            commands::focus_reset,
            commands::focus_get_state,
            commands::tasks_list,
            commands::tasks_add,
            commands::tasks_toggle,
            commands::tasks_delete,
            commands::notes_list,
            commands::notes_add,
            commands::notes_update,
            commands::notes_delete,
            commands::media_now_playing,
            commands::media_control,
            commands::open_youtube_music
        ])
        .setup(|app| {
            let handle = app.handle();

            // Load settings first; everything else keys off them.
            let settings = store::settings::load(handle);

            // Apply saved monitor choice + notch position before showing the pill.
            if let Some(win) = window::island(handle) {
                if settings.monitor_name.is_some() {
                    let _ = window::set_monitor_choice(&win, settings.monitor_name.clone());
                }
                // Seed the notch position state from settings.
                if let Some(state) = win.try_state::<window::NotchPositionState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        *guard = window::NotchPosition::parse(&settings.notch_position);
                    }
                }
                if let Err(e) = window::apply_closed_state(&win) {
                    eprintln!("islet: failed to apply closed window state: {e}");
                }
            } else {
                eprintln!("islet: island window '{}' not found", window::ISLAND_LABEL);
            }

            // Build the focus module and keep a shared handle in state so the
            // focus_* commands and the scheduler callback can reach it.
            let focus = Arc::new(FocusModule::new(handle.clone(), FocusConfig::default()));
            app.manage(FocusHandle(Arc::clone(&focus)));

            // Register modules with their enabled state from settings, then
            // start the enabled ones. A module follows its tab's on/off switch.
            let registry = app.state::<Registry>();
            let focus_enabled = settings
                .tabs
                .iter()
                .find(|t| t.id == "focus")
                .map(|t| t.enabled)
                .unwrap_or(true);
            registry.register(focus, focus_enabled);
            registry.register(Arc::new(ExampleModule), false);
            registry.start_enabled();

            // Seed the hub with the open-task count from disk so the shell and
            // character have it before the Tasks panel is ever opened.
            let task_list = store::tasks::load(handle);
            let open_tasks = store::tasks::open_count(&task_list);
            app.state::<Hub>().update(|s| s.open_tasks = open_tasks);

            // Tray icon + menu. Non-fatal if it fails.
            if let Err(e) = tray::build(handle) {
                eprintln!("islet: failed to build tray: {e}");
            }

            // Toggle hotkey. A conflict is reported to the frontend, not fatal.
            match shortcut::register(handle) {
                Ok(true) => {}
                Ok(false) => {
                    use tauri::Emitter;
                    let _ = app.emit("islet://hotkey-conflict", shortcut_label());
                }
                Err(e) => eprintln!("islet: hotkey error: {e}"),
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Islet")
        .run(|app, event| {
            // On shutdown, stop modules cleanly so nothing is left running.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                app.state::<Registry>().stop_all();
            }
        });
}

/// Human-readable label of the default hotkey, for the conflict message.
fn shortcut_label() -> &'static str {
    "Ctrl+Shift+Space"
}
