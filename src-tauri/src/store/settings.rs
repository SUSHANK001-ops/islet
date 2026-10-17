//! Persisted settings. Mirrors `src/app/settings-store.ts` on the frontend.
//! Loaded on startup, saved (debounced) on change. The Rust side owns the file.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use super::migrate::{self, Migrated};
use super::{flush, read_json, write_json_debounced, StoreError};

pub const SETTINGS_FILE: &str = "settings.json";
pub const SETTINGS_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TabConfig {
    pub id: String,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub schema_version: u32,
    pub theme: String,
    pub monitor_name: Option<String>,
    pub launch_at_startup: bool,
    pub tabs: Vec<TabConfig>,
    /// Active character pack id; None = use the built-in default.
    #[serde(default)]
    pub active_character: Option<String>,
    /// Where the notch sits along the top edge: "left" | "center" | "right".
    #[serde(default = "default_notch_position")]
    pub notch_position: String,
    /// Notch opacity, 0.2..=1.0 (transparency setting).
    #[serde(default = "default_notch_opacity")]
    pub notch_opacity: f32,
}

fn default_notch_position() -> String {
    "center".into()
}

fn default_notch_opacity() -> f32 {
    1.0
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            schema_version: SETTINGS_VERSION,
            theme: "dark".into(),
            monitor_name: None,
            launch_at_startup: false,
            tabs: ["focus", "tasks", "notes", "media"]
                .iter()
                .map(|id| TabConfig {
                    id: (*id).into(),
                    enabled: true,
                })
                .collect(),
            active_character: None,
            notch_position: default_notch_position(),
            notch_opacity: default_notch_opacity(),
        }
    }
}

/// Ordered migration steps for settings. Empty for v1; add steps here for
/// future versions. Never edit a step once shipped.
fn steps() -> Vec<migrate::Step> {
    vec![]
}

/// Load settings from disk, migrating if needed. On first run or on an
/// unrecoverable file, returns defaults (backing up a bad file first).
pub fn load(app: &AppHandle) -> Settings {
    match read_json::<Value>(app, SETTINGS_FILE) {
        Ok(Some(raw)) => match migrate::run(raw, SETTINGS_VERSION, &steps()) {
            Migrated::Ok(v) => serde_json::from_value(v).unwrap_or_default(),
            Migrated::Recover(original) => {
                back_up_bad_file(app, &original);
                Settings::default()
            }
        },
        // Missing file (first run) or read error -> defaults.
        _ => Settings::default(),
    }
}

/// Save settings (debounced). Returns Ok(true) if it actually hit disk.
pub fn save(app: &AppHandle, settings: &Settings) -> Result<bool, StoreError> {
    write_json_debounced(app, SETTINGS_FILE, settings)
}

/// Force-write settings (used on shutdown so no debounced change is lost).
pub fn save_now(app: &AppHandle, settings: &Settings) -> Result<(), StoreError> {
    flush(app, SETTINGS_FILE, settings)
}

/// Preserve an unrecoverable file instead of deleting it, so no user data is
/// silently lost. Best-effort; failures here are non-fatal.
fn back_up_bad_file(app: &AppHandle, original: &Value) {
    let name = format!("settings.corrupt.{}.json", now_stamp());
    let _ = super::write_json_atomic(app, &name, original);
}

/// A filesystem-safe timestamp for backup filenames.
fn now_stamp() -> String {
    use time::OffsetDateTime;
    let t = OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc());
    format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}",
        t.year(),
        t.month() as u8,
        t.day(),
        t.hour(),
        t.minute(),
        t.second()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_current_version_with_four_tabs() {
        let s = Settings::default();
        assert_eq!(s.schema_version, SETTINGS_VERSION);
        assert_eq!(s.tabs.len(), 4);
        assert_eq!(s.theme, "dark");
        assert!(!s.launch_at_startup);
    }

    #[test]
    fn settings_round_trip_json() {
        let s = Settings::default();
        let j = serde_json::to_value(&s).unwrap();
        // camelCase keys on the wire so the frontend type matches.
        assert_eq!(j.get("schemaVersion").unwrap(), SETTINGS_VERSION);
        assert!(j.get("launchAtStartup").is_some());
        let back: Settings = serde_json::from_value(j).unwrap();
        assert_eq!(back, s);
    }
}
