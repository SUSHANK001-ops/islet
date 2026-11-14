//! Coding-agent session companion (Spec 17).
//!
//! Islet can SHOW what a supported local coding agent is doing and surface its
//! approval requests on the notch. Hard rules (AGENTS.v3.md):
//! - Read-only by default. Islet never runs a command, opens a file, scrapes a
//!   terminal, or injects a click.
//! - Events are UNTRUSTED: validated + sanitized in Rust before storage/UI.
//! - Approving a request is a distinct human click; Islet only RECORDS the
//!   decision (Approved/Declined) so the agent can read it back. The decision
//!   file is the entire action — Islet executes nothing.
//! - Off by default. Nothing is watched until the user enables the feature.
//!
//! Channel: the agent writes one JSON event per file into
//! `<app-data>/agents/inbox/`. Islet drains that folder (validates, assigns an
//! id+time, stores, deletes the file) and writes decisions to
//! `<app-data>/agents/decisions/<id>.json`. A watched folder is the simplest
//! trusted-local channel and opens no socket. The drain runs only while the
//! feature is enabled (documented in docs/windows-notes.md).

pub mod event;

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store::{data_root, read_json, write_json_atomic, StoreError};
use event::{AgentEvent, Decision, RawEvent};

pub const AGENTS_LOG_FILE: &str = "agents/events.json";
pub const AGENTS_VERSION: u32 = 1;
/// Keep the most recent N events (ring buffer): agents can be chatty.
const MAX_EVENTS: usize = 300;
/// Cap a single inbox file so a hostile drop cannot exhaust memory.
const MAX_EVENT_FILE_BYTES: u64 = 64 * 1024;
/// Cap how many files we drain per pass so one burst cannot stall the tick.
const MAX_DRAIN_PER_PASS: usize = 50;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentLog {
    pub schema_version: u32,
    pub events: Vec<AgentEvent>,
}

impl Default for AgentLog {
    fn default() -> Self {
        AgentLog {
            schema_version: AGENTS_VERSION,
            events: Vec::new(),
        }
    }
}

fn inbox_dir(app: &AppHandle) -> Result<PathBuf, StoreError> {
    let dir = data_root(app)?.join("agents").join("inbox");
    fs::create_dir_all(&dir).map_err(|e| StoreError::Io(e.to_string()))?;
    Ok(dir)
}

fn decisions_dir(app: &AppHandle) -> Result<PathBuf, StoreError> {
    let dir = data_root(app)?.join("agents").join("decisions");
    fs::create_dir_all(&dir).map_err(|e| StoreError::Io(e.to_string()))?;
    Ok(dir)
}

fn now_iso() -> String {
    use time::OffsetDateTime;
    let t = OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc());
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
        t.year(),
        t.month() as u8,
        t.day(),
        t.hour(),
        t.minute(),
        t.second()
    )
}

/// A monotonic-ish id for an ingested event: time + a short random suffix.
fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("evt-{nanos:x}")
}

pub fn load(app: &AppHandle) -> AgentLog {
    read_json::<AgentLog>(app, AGENTS_LOG_FILE)
        .ok()
        .flatten()
        .filter(|l| l.schema_version == AGENTS_VERSION)
        .unwrap_or_default()
}

fn save(app: &AppHandle, log: &AgentLog) -> Result<(), StoreError> {
    write_json_atomic(app, AGENTS_LOG_FILE, log)
}

/// Drain the inbox: read each JSON file, validate it, append the stored event,
/// and delete the file (processed). Returns how many events were ingested.
/// Best-effort on individual files: a bad file is removed and skipped so it
/// cannot wedge the pipeline. Only called while the feature is enabled.
pub fn drain_inbox(app: &AppHandle) -> Result<usize, StoreError> {
    let dir = inbox_dir(app)?;
    let mut log = load(app);
    let mut ingested = 0usize;

    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(0),
    };

    for entry in entries.flatten().take(MAX_DRAIN_PER_PASS) {
        let path = entry.path();
        // Only *.json files; ignore anything else (e.g. a half-written .tmp).
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        // Size cap before reading.
        let too_big = fs::metadata(&path)
            .map(|m| m.len() > MAX_EVENT_FILE_BYTES)
            .unwrap_or(true);
        if too_big {
            let _ = fs::remove_file(&path);
            continue;
        }

        let parsed = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<RawEvent>(&s).ok())
            .and_then(|raw| event::validate(raw, new_id(), now_iso()).ok());

        if let Some(ev) = parsed {
            log.events.push(ev);
            ingested += 1;
        }
        // Always remove the processed (or unparseable) file.
        let _ = fs::remove_file(&path);
    }

    if ingested > 0 {
        let len = log.events.len();
        if len > MAX_EVENTS {
            log.events.drain(0..len - MAX_EVENTS);
        }
        save(app, &log)?;
    }
    Ok(ingested)
}

/// Record the user's decision on a command-proposal event. Islet NEVER runs the
/// command — it only writes the decision so the agent can read it back and act
/// (or not). Updates the stored event and writes a decision file.
pub fn decide(app: &AppHandle, id: &str, approve: bool) -> Result<AgentLog, StoreError> {
    let mut log = load(app);
    let decision = if approve {
        Decision::Approved
    } else {
        Decision::Declined
    };

    let mut found = false;
    for ev in log.events.iter_mut() {
        if ev.id == id && ev.kind.needs_approval() {
            ev.decision = decision.clone();
            found = true;
            break;
        }
    }
    if !found {
        return Ok(log);
    }
    save(app, &log)?;

    // Write the decision file the agent polls for. Just the verdict + time.
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct DecisionFile<'a> {
        id: &'a str,
        decision: &'a str,
        time: String,
    }
    if let Ok(dir) = decisions_dir(app) {
        let file = dir.join(format!("{id}.json"));
        let body = DecisionFile {
            id,
            decision: if approve { "approved" } else { "declined" },
            time: now_iso(),
        };
        if let Ok(json) = serde_json::to_vec_pretty(&body) {
            let _ = fs::write(file, json);
        }
    }
    Ok(log)
}

/// Clear the stored event log (user action). Does not touch the inbox.
pub fn clear(app: &AppHandle) -> Result<(), StoreError> {
    save(app, &AgentLog::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_log_is_versioned_empty() {
        let l = AgentLog::default();
        assert_eq!(l.schema_version, AGENTS_VERSION);
        assert!(l.events.is_empty());
    }

    #[test]
    fn ring_buffer_trim_keeps_newest() {
        let mut events: Vec<u32> = (0..(MAX_EVENTS as u32 + 20)).collect();
        let len = events.len();
        if len > MAX_EVENTS {
            events.drain(0..len - MAX_EVENTS);
        }
        assert_eq!(events.len(), MAX_EVENTS);
        assert_eq!(*events.last().unwrap(), MAX_EVENTS as u32 + 19);
    }

    #[test]
    fn new_id_has_prefix() {
        assert!(new_id().starts_with("evt-"));
    }
}
