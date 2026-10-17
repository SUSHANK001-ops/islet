//! Quick notes, persisted as versioned JSON (`notes.json`). Rust owns the file.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use super::migrate::{self, Migrated};
use super::{read_json, write_json_debounced, StoreError};

pub const NOTES_FILE: &str = "notes.json";
pub const NOTES_VERSION: u32 = 1;
const MAX_NOTES: usize = 500;
const MAX_NOTE_LEN: usize = 4000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub text: String,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteList {
    pub schema_version: u32,
    pub notes: Vec<Note>,
}

impl Default for NoteList {
    fn default() -> Self {
        NoteList {
            schema_version: NOTES_VERSION,
            notes: Vec::new(),
        }
    }
}

fn steps() -> Vec<migrate::Step> {
    vec![]
}

pub fn load(app: &AppHandle) -> NoteList {
    match read_json::<Value>(app, NOTES_FILE) {
        Ok(Some(raw)) => match migrate::run(raw, NOTES_VERSION, &steps()) {
            Migrated::Ok(v) => serde_json::from_value(v).unwrap_or_default(),
            Migrated::Recover(_) => NoteList::default(),
        },
        _ => NoteList::default(),
    }
}

fn save(app: &AppHandle, list: &NoteList) -> Result<(), StoreError> {
    write_json_debounced(app, NOTES_FILE, list).map(|_| ())
}

/// Clamp text to the per-note cap (defensive; untrusted length).
fn clamp(text: &str) -> String {
    text.chars().take(MAX_NOTE_LEN).collect()
}

pub fn add(app: &AppHandle, text: &str) -> Result<NoteList, StoreError> {
    let mut list = load(app);
    let text = clamp(text.trim());
    if !text.is_empty() && list.notes.len() < MAX_NOTES {
        list.notes.insert(
            0,
            Note {
                id: new_id(),
                text,
                updated_at: now_secs(),
            },
        );
        save(app, &list)?;
    }
    Ok(list)
}

pub fn update(app: &AppHandle, id: &str, text: &str) -> Result<NoteList, StoreError> {
    let mut list = load(app);
    if let Some(n) = list.notes.iter_mut().find(|n| n.id == id) {
        n.text = clamp(text.trim());
        n.updated_at = now_secs();
        save(app, &list)?;
    }
    Ok(list)
}

pub fn delete(app: &AppHandle, id: &str) -> Result<NoteList, StoreError> {
    let mut list = load(app);
    let before = list.notes.len();
    list.notes.retain(|n| n.id != id);
    if list.notes.len() != before {
        save(app, &list)?;
    }
    Ok(list)
}

fn now_secs() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn new_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("n{nanos:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_limits_length() {
        let long = "a".repeat(MAX_NOTE_LEN + 100);
        assert_eq!(clamp(&long).chars().count(), MAX_NOTE_LEN);
    }

    #[test]
    fn default_is_empty_current_version() {
        let l = NoteList::default();
        assert_eq!(l.schema_version, NOTES_VERSION);
        assert!(l.notes.is_empty());
    }

    #[test]
    fn round_trips_camel_case() {
        let l = NoteList {
            schema_version: 1,
            notes: vec![Note { id: "n1".into(), text: "hi".into(), updated_at: 9 }],
        };
        let j = serde_json::to_value(&l).unwrap();
        assert!(j["notes"][0].get("updatedAt").is_some());
        let back: NoteList = serde_json::from_value(j).unwrap();
        assert_eq!(back, l);
    }
}
