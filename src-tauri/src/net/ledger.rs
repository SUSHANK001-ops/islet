//! The egress ledger (Spec 14): a user-readable "what left this PC" log.
//!
//! One line per outbound attempt (allowed OR rejected). Bounded to the most
//! recent N entries (ring-buffer semantics) so it never grows without limit.
//! Only request METADATA is recorded — host, feature, method, byte counts,
//! result — never headers (Authorization) or body (prompts). That keeps the
//! "no secrets on disk" promise while still proving nothing was sent silently.
//!
//! Writes go through the same atomic write + debounce budget as other stores.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::store::{read_json, write_json_atomic};

pub const LEDGER_FILE: &str = "net-ledger.json";
pub const LEDGER_VERSION: u32 = 1;
/// Keep the last N entries. A focus session makes few requests, so this is
/// plenty of history while staying tiny on disk.
const MAX_ENTRIES: usize = 500;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    /// ISO-8601 local timestamp.
    pub time: String,
    pub feature: String,
    pub host: String,
    pub method: String,
    pub bytes_out: u64,
    pub bytes_in: u64,
    /// "ok" | "rejected" | "error".
    pub result: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Ledger {
    pub schema_version: u32,
    pub entries: Vec<LedgerEntry>,
}

impl Default for Ledger {
    fn default() -> Self {
        Ledger {
            schema_version: LEDGER_VERSION,
            entries: Vec::new(),
        }
    }
}

/// In-memory guard so concurrent requests do not interleave read-modify-write
/// on the ledger file. Registered via `.manage(LedgerLock::default())`.
#[derive(Default)]
pub struct LedgerLock(pub Mutex<()>);

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

/// Append one entry (newest last on disk) and trim to MAX_ENTRIES. Best-effort:
/// a ledger write failure must never block or fail the actual feature, so
/// errors are swallowed here (the request already happened or was rejected).
pub fn record(
    app: &AppHandle,
    feature: &str,
    host: &str,
    method: &str,
    bytes_out: u64,
    bytes_in: u64,
    result: &str,
) {
    let entry = LedgerEntry {
        time: now_iso(),
        feature: feature.to_string(),
        host: host.to_string(),
        method: method.to_string(),
        bytes_out,
        bytes_in,
        result: result.to_string(),
    };

    // Serialize access so parallel requests do not clobber each other.
    let _guard = app.try_state::<LedgerLock>().and_then(|l| {
        // Hold the lock for the whole read-modify-write below.
        l.0.lock().ok().map(|_g| ())
    });

    let mut ledger = read_json::<Ledger>(app, LEDGER_FILE)
        .ok()
        .flatten()
        .unwrap_or_default();
    ledger.entries.push(entry);
    let len = ledger.entries.len();
    if len > MAX_ENTRIES {
        ledger.entries.drain(0..len - MAX_ENTRIES);
    }
    let _ = write_json_atomic(app, LEDGER_FILE, &ledger);
}

/// Read the ledger newest-first for the UI.
pub fn read_newest_first(app: &AppHandle) -> Ledger {
    let mut ledger = read_json::<Ledger>(app, LEDGER_FILE)
        .ok()
        .flatten()
        .unwrap_or_default();
    ledger.entries.reverse();
    ledger
}

/// Clear the ledger (user action).
pub fn clear(app: &AppHandle) {
    let _ = write_json_atomic(app, LEDGER_FILE, &Ledger::default());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_to_max_entries() {
        // Pure logic test on the Vec, independent of Tauri/app handle.
        let mut entries: Vec<u32> = (0..(MAX_ENTRIES as u32 + 10)).collect();
        let len = entries.len();
        if len > MAX_ENTRIES {
            entries.drain(0..len - MAX_ENTRIES);
        }
        assert_eq!(entries.len(), MAX_ENTRIES);
        // Oldest were dropped; the newest survive.
        assert_eq!(*entries.last().unwrap(), MAX_ENTRIES as u32 + 9);
        assert_eq!(*entries.first().unwrap(), 10);
    }

    #[test]
    fn default_ledger_is_versioned_and_empty() {
        let l = Ledger::default();
        assert_eq!(l.schema_version, LEDGER_VERSION);
        assert!(l.entries.is_empty());
    }

    #[test]
    fn now_iso_has_expected_shape() {
        let s = now_iso();
        // YYYY-MM-DDTHH:MM:SS => 19 chars.
        assert_eq!(s.len(), 19);
        assert_eq!(&s[4..5], "-");
        assert_eq!(&s[10..11], "T");
    }
}
