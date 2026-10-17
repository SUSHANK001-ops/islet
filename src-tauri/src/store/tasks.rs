//! To-do tasks, persisted as versioned JSON (`tasks.json`). Rust owns the file.
//! The open-task count is published to the shared hub so the character and
//! shell can react without the Tasks module calling them directly.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use super::migrate::{self, Migrated};
use super::{read_json, write_json_debounced, StoreError};

pub const TASKS_FILE: &str = "tasks.json";
pub const TASKS_VERSION: u32 = 1;
/// Upper bound so the list cannot grow without limit (memory rule).
const MAX_TASKS: usize = 1000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub done: bool,
    /// Unix seconds when created, for stable ordering.
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskList {
    pub schema_version: u32,
    pub tasks: Vec<Task>,
}

impl Default for TaskList {
    fn default() -> Self {
        TaskList {
            schema_version: TASKS_VERSION,
            tasks: Vec::new(),
        }
    }
}

fn steps() -> Vec<migrate::Step> {
    vec![]
}

/// Load the task list, migrating/recovering as needed.
pub fn load(app: &AppHandle) -> TaskList {
    match read_json::<Value>(app, TASKS_FILE) {
        Ok(Some(raw)) => match migrate::run(raw, TASKS_VERSION, &steps()) {
            Migrated::Ok(v) => serde_json::from_value(v).unwrap_or_default(),
            Migrated::Recover(_) => TaskList::default(),
        },
        _ => TaskList::default(),
    }
}

fn save(app: &AppHandle, list: &TaskList) -> Result<(), StoreError> {
    write_json_debounced(app, TASKS_FILE, list).map(|_| ())
}

/// Count of not-done tasks (for the hub).
pub fn open_count(list: &TaskList) -> u32 {
    list.tasks.iter().filter(|t| !t.done).count() as u32
}

/// Add a task. Ignores blank titles; enforces the cap.
pub fn add(app: &AppHandle, title: &str) -> Result<TaskList, StoreError> {
    let title = title.trim();
    let mut list = load(app);
    if !title.is_empty() && list.tasks.len() < MAX_TASKS {
        list.tasks.push(Task {
            id: new_id(),
            title: title.to_string(),
            done: false,
            created_at: now_secs(),
        });
        save(app, &list)?;
    }
    Ok(list)
}

/// Toggle a task's done state.
pub fn toggle(app: &AppHandle, id: &str) -> Result<TaskList, StoreError> {
    let mut list = load(app);
    if let Some(t) = list.tasks.iter_mut().find(|t| t.id == id) {
        t.done = !t.done;
        save(app, &list)?;
    }
    Ok(list)
}

/// Delete a task.
pub fn delete(app: &AppHandle, id: &str) -> Result<TaskList, StoreError> {
    let mut list = load(app);
    let before = list.tasks.len();
    list.tasks.retain(|t| t.id != id);
    if list.tasks.len() != before {
        save(app, &list)?;
    }
    Ok(list)
}

fn now_secs() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

/// A simple unique id: timestamp-nanos in base36. Good enough for local items.
fn new_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("t{nanos:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_count_ignores_done() {
        let list = TaskList {
            schema_version: TASKS_VERSION,
            tasks: vec![
                Task { id: "a".into(), title: "x".into(), done: false, created_at: 0 },
                Task { id: "b".into(), title: "y".into(), done: true, created_at: 0 },
                Task { id: "c".into(), title: "z".into(), done: false, created_at: 0 },
            ],
        };
        assert_eq!(open_count(&list), 2);
    }

    #[test]
    fn default_is_empty_current_version() {
        let l = TaskList::default();
        assert_eq!(l.schema_version, TASKS_VERSION);
        assert!(l.tasks.is_empty());
    }

    #[test]
    fn round_trips_camel_case() {
        let l = TaskList {
            schema_version: 1,
            tasks: vec![Task { id: "a".into(), title: "x".into(), done: false, created_at: 5 }],
        };
        let j = serde_json::to_value(&l).unwrap();
        assert!(j.get("schemaVersion").is_some());
        assert!(j["tasks"][0].get("createdAt").is_some());
        let back: TaskList = serde_json::from_value(j).unwrap();
        assert_eq!(back, l);
    }
}
