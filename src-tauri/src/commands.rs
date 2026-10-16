//! The ONLY functions the frontend may call (AGENTS.md security rule).
//! Keep this list small and auditable. No raw shell, no raw file access.

use serde::Serialize;
use tauri::WebviewWindow;

use crate::app_config::APP_NAME;
use crate::{platform, window};

/// Snapshot the spike cares about: monitor/DPI/fullscreen state.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpikeReport {
    app_name: String,
    monitor_count: usize,
    active_monitor_name: String,
    scale_factor: f64,
    work_area_width: u32,
    work_area_height: u32,
    fullscreen_app_active: bool,
}

/// Open or close the panel. The window layer flips size + click-through.
#[tauri::command]
pub fn set_panel_open(window: WebviewWindow, open: bool) -> Result<(), String> {
    let result = if open {
        window::apply_open_state(&window)
    } else {
        window::apply_closed_state(&window)
    };
    result.map_err(|e| format!("failed to set panel state: {e}"))
}

/// Gather the spike report. Read-only; safe to call any time the panel is open.
#[tauri::command]
pub fn get_spike_report(window: WebviewWindow) -> Result<SpikeReport, String> {
    let monitor = window::active_monitor(&window);

    let (name, scale, w, h) = match monitor {
        Some(m) => {
            let scale = m.scale_factor();
            let size = m.size().to_logical::<f64>(scale);
            (
                m.name().cloned().unwrap_or_default(),
                scale,
                size.width as u32,
                size.height as u32,
            )
        }
        None => (String::new(), 1.0, 0, 0),
    };

    Ok(SpikeReport {
        app_name: APP_NAME.to_string(),
        monitor_count: window::monitor_count(&window),
        active_monitor_name: name,
        scale_factor: scale,
        work_area_width: w,
        work_area_height: h,
        fullscreen_app_active: platform::is_fullscreen_app_active(),
    })
}
