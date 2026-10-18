//! Local calendar events (Spec 11). Versioned JSON, atomic writes, no network,
//! no account. Each event: id, title, ISO date (YYYY-MM-DD), optional HH:MM.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::{read_json, write_json_atomic, StoreError};

pub const EVENTS_FILE: &str = "events.json";
pub const EVENTS_VERSION: u32 = 1;
const MAX_EVENTS: usize = 2000;
const MAX_TITLE: usize = 120;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CalEvent {
    pub id: String,
    pub title: String,
    pub date: String,          // YYYY-MM-DD
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time: Option<String>,  // HH:MM, optional
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EventList {
    pub schema_version: u32,
    pub events: Vec<CalEvent>,
}

impl Default for EventList {
    fn default() -> Self {
        EventList {
            schema_version: EVENTS_VERSION,
            events: Vec::new(),
        }
    }
}

pub fn load(app: &AppHandle) -> EventList {
    match read_json::<EventList>(app, EVENTS_FILE) {
        Ok(Some(v)) if v.schema_version == EVENTS_VERSION => v,
        _ => EventList::default(),
    }
}

fn save(app: &AppHandle, list: &EventList) -> Result<(), StoreError> {
    write_json_atomic(app, EVENTS_FILE, list)
}

fn valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    s.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && s.chars()
            .enumerate()
            .all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() })
}

/// Events whose date starts with `YYYY-MM` (one month), sorted by date+time.
pub fn list_month(app: &AppHandle, year_month: &str) -> Vec<CalEvent> {
    let mut v: Vec<CalEvent> = load(app)
        .events
        .into_iter()
        .filter(|e| e.date.starts_with(year_month))
        .collect();
    v.sort_by(|a, b| (a.date.as_str(), a.time.as_deref()).cmp(&(b.date.as_str(), b.time.as_deref())));
    v
}

pub fn add(app: &AppHandle, title: &str, date: &str, time: Option<String>) -> Result<EventList, StoreError> {
    if !valid_date(date) {
        return Err(StoreError::Io(format!("invalid date: {date}")));
    }
    let mut list = load(app);
    let title: String = title.trim().chars().take(MAX_TITLE).collect();
    if !title.is_empty() && list.events.len() < MAX_EVENTS {
        list.events.push(CalEvent {
            id: new_id(),
            title,
            date: date.to_string(),
            time: time.filter(|t| !t.is_empty()),
        });
        save(app, &list)?;
    }
    Ok(list)
}

pub fn delete(app: &AppHandle, id: &str) -> Result<EventList, StoreError> {
    let mut list = load(app);
    let before = list.events.len();
    list.events.retain(|e| e.id != id);
    if list.events.len() != before {
        save(app, &list)?;
    }
    Ok(list)
}

/// The next event on or after `today` (YYYY-MM-DD), for the hub "next event".
pub fn next_event(app: &AppHandle, today: &str) -> Option<CalEvent> {
    let mut upcoming: Vec<CalEvent> = load(app)
        .events
        .into_iter()
        .filter(|e| e.date.as_str() >= today)
        .collect();
    upcoming.sort_by(|a, b| a.date.cmp(&b.date));
    upcoming.into_iter().next()
}

fn new_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("e{nanos:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_empty_versioned() {
        let l = EventList::default();
        assert_eq!(l.schema_version, EVENTS_VERSION);
        assert!(l.events.is_empty());
    }

    #[test]
    fn date_validation() {
        assert!(valid_date("2026-10-18"));
        assert!(!valid_date("2026/10/18"));
        assert!(!valid_date("bad"));
    }
}
