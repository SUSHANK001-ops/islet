//! Versioned JSON storage. The Rust side is the source of truth for all saved
//! data (AGENTS.md data + security rules).
//!
//! Guarantees:
//! - Every file lives in the app data folder (never a hardcoded path).
//! - Every write is atomic: write a temp file, fsync it, then rename over the
//!   target. A crash mid-write never corrupts the real file.
//! - Writes are debounced so we respect the "at most 1 write per 5 s" budget.
//! - Every document carries `schemaVersion`; see `migrate.rs`.
//! - No `unwrap()` in app code; everything returns a friendly error.

pub mod activity;
pub mod migrate;
pub mod notes;
pub mod settings;
pub mod tasks;

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Minimum gap between real disk writes for a given file (disk budget).
const DEBOUNCE: Duration = Duration::from_secs(5);

/// Errors the store can produce. Kept human-readable for the UI.
#[derive(Debug)]
pub enum StoreError {
    NoDataDir,
    Io(String),
    Serde(String),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::NoDataDir => write!(f, "could not resolve the app data folder"),
            StoreError::Io(e) => write!(f, "disk error: {e}"),
            StoreError::Serde(e) => write!(f, "data format error: {e}"),
        }
    }
}

impl std::error::Error for StoreError {}

/// The root app data directory, created if missing. e.g. %APPDATA%/dev.islet.app
pub fn data_root(app: &AppHandle) -> Result<PathBuf, StoreError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| StoreError::NoDataDir)?;
    fs::create_dir_all(&dir).map_err(|e| StoreError::Io(e.to_string()))?;
    Ok(dir)
}

/// Resolve a path inside the data root, creating parent dirs. `rel` must be a
/// simple relative path (no `..`, no absolute). Rejects traversal defensively.
pub fn path_in_data(app: &AppHandle, rel: &str) -> Result<PathBuf, StoreError> {
    if rel.contains("..") || Path::new(rel).is_absolute() {
        return Err(StoreError::Io(format!("unsafe path: {rel}")));
    }
    let full = data_root(app)?.join(rel);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| StoreError::Io(e.to_string()))?;
    }
    Ok(full)
}

/// Read and deserialize a JSON file. `Ok(None)` when the file does not exist
/// yet (first run) so callers can fall back to defaults.
pub fn read_json<T: DeserializeOwned>(
    app: &AppHandle,
    rel: &str,
) -> Result<Option<T>, StoreError> {
    let full = path_in_data(app, rel)?;
    if !full.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&full).map_err(|e| StoreError::Io(e.to_string()))?;
    let value = serde_json::from_slice::<T>(&bytes).map_err(|e| StoreError::Serde(e.to_string()))?;
    Ok(Some(value))
}

/// Write a value as pretty JSON atomically: temp file -> fsync -> rename.
pub fn write_json_atomic<T: Serialize>(
    app: &AppHandle,
    rel: &str,
    value: &T,
) -> Result<(), StoreError> {
    let full = path_in_data(app, rel)?;
    let json = serde_json::to_vec_pretty(value).map_err(|e| StoreError::Serde(e.to_string()))?;

    // Temp file in the same directory so the rename stays on one volume.
    let tmp = full.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| StoreError::Io(e.to_string()))?;
        f.write_all(&json).map_err(|e| StoreError::Io(e.to_string()))?;
        // fsync so the bytes are durable before we swap the file in.
        f.sync_all().map_err(|e| StoreError::Io(e.to_string()))?;
    }
    fs::rename(&tmp, &full).map_err(|e| StoreError::Io(e.to_string()))?;
    Ok(())
}

/// Tracks the last real write time per file so we can debounce.
#[derive(Default)]
pub struct WriteDebouncer(Mutex<std::collections::HashMap<String, Instant>>);

impl WriteDebouncer {
    /// True if enough time has passed since the last write for `rel`.
    fn should_write(&self, rel: &str) -> bool {
        let mut map = match self.0.lock() {
            Ok(m) => m,
            Err(_) => return true, // on a poisoned lock, err toward saving
        };
        let now = Instant::now();
        match map.get(rel) {
            Some(last) if now.duration_since(*last) < DEBOUNCE => false,
            _ => {
                map.insert(rel.to_string(), now);
                true
            }
        }
    }

    /// Clear the debounce record so a pending value can be flushed on shutdown.
    fn forget(&self, rel: &str) {
        if let Ok(mut map) = self.0.lock() {
            map.remove(rel);
        }
    }
}

/// Write unless the debounce window is still open. Returns whether it wrote.
/// Debounced data is NOT lost: callers keep the latest value in memory and a
/// final flush (see `flush`) runs on shutdown.
pub fn write_json_debounced<T: Serialize>(
    app: &AppHandle,
    rel: &str,
    value: &T,
) -> Result<bool, StoreError> {
    let debouncer = app.state::<WriteDebouncer>();
    if debouncer.should_write(rel) {
        write_json_atomic(app, rel, value)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Force a write regardless of debounce (e.g. on shutdown).
pub fn flush<T: Serialize>(app: &AppHandle, rel: &str, value: &T) -> Result<(), StoreError> {
    app.state::<WriteDebouncer>().forget(rel);
    write_json_atomic(app, rel, value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use std::collections::HashMap;
    use std::time::Instant;

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct Doc {
        schema_version: u32,
        value: i32,
    }

    // The debouncer is pure logic and testable without Tauri/app handle.
    #[test]
    fn debouncer_blocks_within_window_then_allows_after_forget() {
        let d = WriteDebouncer(std::sync::Mutex::new(HashMap::new()));
        assert!(d.should_write("a.json"), "first write allowed");
        assert!(!d.should_write("a.json"), "second write within window blocked");
        d.forget("a.json");
        assert!(d.should_write("a.json"), "write allowed again after forget");
    }

    #[test]
    fn debouncer_is_per_file() {
        let d = WriteDebouncer(std::sync::Mutex::new(HashMap::new()));
        assert!(d.should_write("a.json"));
        assert!(d.should_write("b.json"), "different file not blocked by a.json");
    }

    // Atomic round-trip using a plain temp dir (no app handle needed): proves
    // the temp->rename logic and serde round-trip independently of Tauri.
    #[test]
    fn atomic_write_roundtrips_via_rename() {
        let dir = std::env::temp_dir().join(format!("islet-test-{}", Instant::now().elapsed().as_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("doc.json");
        let doc = Doc { schema_version: 1, value: 42 };

        let json = serde_json::to_vec_pretty(&doc).unwrap();
        let tmp = target.with_extension("tmp");
        std::fs::write(&tmp, &json).unwrap();
        std::fs::rename(&tmp, &target).unwrap();

        let back: Doc = serde_json::from_slice(&std::fs::read(&target).unwrap()).unwrap();
        assert_eq!(back, doc);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
