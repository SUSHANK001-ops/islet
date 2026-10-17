//! The ONLY functions the frontend may call (AGENTS.md security rule).
//! Keep this list small and auditable. No raw shell, no raw file access.

use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};

use crate::app_config::APP_NAME;
use crate::modules::focus::engine::FocusState;
use crate::modules::focus::FocusHandle;
use crate::modules::hub::{Hub, HubSnapshot};
use crate::modules::registry::{ModuleInfo, Registry};
use crate::store::activity::{self, ActivityDay};
use crate::store::notes::{self, NoteList};
use crate::store::settings::{self, Settings};
use crate::store::tasks::{self, TaskList};
use crate::platform::media::{MediaAction, NowPlaying};
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

/// List connected monitors by name, for the monitor-choice setting.
#[tauri::command]
pub fn list_monitors(window: WebviewWindow) -> Vec<String> {
    window::monitor_names(&window)
}

/// Choose which monitor the pill lives on. `None`/empty means "primary".
/// Re-places the pill immediately. Missing monitor falls back to primary.
#[tauri::command]
pub fn set_monitor(window: WebviewWindow, name: Option<String>) -> Result<(), String> {
    let choice = name.filter(|n| !n.is_empty());
    window::set_monitor_choice(&window, choice).map_err(|e| format!("set_monitor failed: {e}"))
}

// ---- Spec 2: storage, settings, modules ----

/// Load persisted settings (or defaults on first run / recovery).
#[tauri::command]
pub fn load_settings(app: AppHandle) -> Settings {
    settings::load(&app)
}

/// Save settings (debounced). Returns true if it actually hit disk this call.
#[tauri::command]
pub fn save_settings(app: AppHandle, value: Settings) -> Result<bool, String> {
    settings::save(&app, &value).map_err(|e| e.to_string())
}

/// Force-write settings now, bypassing debounce. The frontend calls this on
/// window unload so the last change within the debounce window is never lost.
#[tauri::command]
pub fn flush_settings(app: AppHandle, value: Settings) -> Result<(), String> {
    settings::save_now(&app, &value).map_err(|e| e.to_string())
}

/// Append one event to today's activity log.
#[tauri::command]
pub fn append_activity(
    app: AppHandle,
    kind: String,
    data: Option<serde_json::Value>,
) -> Result<(), String> {
    activity::append(&app, &kind, data).map_err(|e| e.to_string())
}

/// Read a day's activity. `date` must be YYYY-MM-DD.
#[tauri::command]
pub fn read_activity_day(app: AppHandle, date: String) -> Result<ActivityDay, String> {
    activity::read_day(&app, &date).map_err(|e| e.to_string())
}

/// List modules and their enabled/running state.
#[tauri::command]
pub fn list_modules(registry: tauri::State<'_, Registry>) -> Vec<ModuleInfo> {
    registry.list()
}

/// Turn a module on/off (starts/stops it). Returns the new state, if it exists.
#[tauri::command]
pub fn set_module_enabled(
    registry: tauri::State<'_, Registry>,
    id: String,
    enabled: bool,
) -> Option<ModuleInfo> {
    registry.set_enabled(&id, enabled)
}

/// Read the shared hub snapshot (task count, focus clock, tally, ...).
#[tauri::command]
pub fn get_hub(hub: tauri::State<'_, Hub>) -> HubSnapshot {
    hub.snapshot()
}

// ---- Spec 3: focus timer ----

/// Start a focus round with the given preset length in minutes.
#[tauri::command]
pub fn focus_start(focus: tauri::State<'_, FocusHandle>, minutes: u32) -> FocusState {
    focus.0.with_engine(|e| e.start_work(minutes));
    focus.0.state()
}

#[tauri::command]
pub fn focus_pause(focus: tauri::State<'_, FocusHandle>) -> FocusState {
    focus.0.with_engine(|e| e.pause());
    focus.0.state()
}

#[tauri::command]
pub fn focus_resume(focus: tauri::State<'_, FocusHandle>) -> FocusState {
    focus.0.with_engine(|e| e.resume());
    focus.0.state()
}

#[tauri::command]
pub fn focus_reset(focus: tauri::State<'_, FocusHandle>) -> FocusState {
    focus.0.with_engine(|e| e.reset());
    focus.0.state()
}

/// Read the current focus state (used when the panel opens).
#[tauri::command]
pub fn focus_get_state(focus: tauri::State<'_, FocusHandle>) -> FocusState {
    focus.0.state()
}

// ---- Spec 4: tasks ----

/// Publish the open-task count to the hub after any change.
fn publish_task_count(hub: &tauri::State<'_, Hub>, list: &TaskList) {
    let open = tasks::open_count(list);
    hub.update(|s| s.open_tasks = open);
}

#[tauri::command]
pub fn tasks_list(app: AppHandle, hub: tauri::State<'_, Hub>) -> TaskList {
    let list = tasks::load(&app);
    publish_task_count(&hub, &list);
    list
}

#[tauri::command]
pub fn tasks_add(
    app: AppHandle,
    hub: tauri::State<'_, Hub>,
    title: String,
) -> Result<TaskList, String> {
    let list = tasks::add(&app, &title).map_err(|e| e.to_string())?;
    publish_task_count(&hub, &list);
    Ok(list)
}

#[tauri::command]
pub fn tasks_toggle(
    app: AppHandle,
    hub: tauri::State<'_, Hub>,
    id: String,
) -> Result<TaskList, String> {
    let list = tasks::toggle(&app, &id).map_err(|e| e.to_string())?;
    publish_task_count(&hub, &list);
    Ok(list)
}

#[tauri::command]
pub fn tasks_delete(
    app: AppHandle,
    hub: tauri::State<'_, Hub>,
    id: String,
) -> Result<TaskList, String> {
    let list = tasks::delete(&app, &id).map_err(|e| e.to_string())?;
    publish_task_count(&hub, &list);
    Ok(list)
}

// ---- Spec 4: notes ----

#[tauri::command]
pub fn notes_list(app: AppHandle) -> NoteList {
    notes::load(&app)
}

#[tauri::command]
pub fn notes_add(app: AppHandle, text: String) -> Result<NoteList, String> {
    notes::add(&app, &text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn notes_update(app: AppHandle, id: String, text: String) -> Result<NoteList, String> {
    notes::update(&app, &id, &text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn notes_delete(app: AppHandle, id: String) -> Result<NoteList, String> {
    notes::delete(&app, &id).map_err(|e| e.to_string())
}

// ---- Spec 5: media (SMTC) ----

/// Current now-playing info, or null when nothing is playing.
#[tauri::command]
pub fn media_now_playing() -> Option<NowPlaying> {
    platform::media::now_playing()
}

/// Send a transport action (play/pause, next, previous). Returns whether it
/// was accepted by the owning media app.
#[tauri::command]
pub fn media_control(action: MediaAction) -> bool {
    platform::media::control(action)
}

/// Open YouTube Music in the user's default browser. The URL is FIXED here (not
/// passed from the frontend) so this command can never be used to open an
/// arbitrary link — it only ever opens the one allow-listed destination.
#[tauri::command]
pub fn open_youtube_music(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url("https://music.youtube.com", None::<&str>)
        .map_err(|e| format!("could not open YouTube Music: {e}"))
}
