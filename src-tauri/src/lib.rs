//! Islet library entry. `main.rs` just calls `run()`.
//!
//! Spec 0 (the spike) wiring only: build the island window in its closed,
//! click-through, top-center state, and expose the two spike commands.

mod app_config;
mod commands;
mod platform;
mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::set_panel_open,
            commands::get_spike_report
        ])
        .setup(|app| {
            // Place the pill correctly the moment the app is usable.
            // Show the pill first, then let the frontend load (startup rule).
            if let Some(win) = window::island(app.handle()) {
                // If this fails we still want the app to run, so log and continue.
                if let Err(e) = window::apply_closed_state(&win) {
                    eprintln!("islet: failed to apply closed window state: {e}");
                }
            } else {
                eprintln!("islet: island window '{}' not found", window::ISLAND_LABEL);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Islet");
}
