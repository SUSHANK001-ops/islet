//! Activity log: one small JSON file per day (`activity/YYYY-MM-DD.json`).
//! Append-only, bounded (a new file each day; a per-day cap stops runaway
//! growth). Later specs emit events like focus.completed / task.completed.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use time::OffsetDateTime;

use super::{read_json, write_json_atomic, StoreError};

pub const ACTIVITY_VERSION: u32 = 1;
/// Safety cap so a single day's file can never grow without bound.
const MAX_EVENTS_PER_DAY: usize = 5000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    /// Event kind, e.g. "focus.completed", "task.completed", "break.taken".
    pub kind: String,
    /// Unix seconds (UTC) when it happened.
    pub at: i64,
    /// Optional small payload (minutes, count, etc.). Kept tiny.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDay {
    pub schema_version: u32,
    pub date: String, // YYYY-MM-DD
    pub events: Vec<ActivityEvent>,
}

impl ActivityDay {
    fn empty(date: String) -> Self {
        ActivityDay {
            schema_version: ACTIVITY_VERSION,
            date,
            events: Vec::new(),
        }
    }
}

/// Today's local date as YYYY-MM-DD. Falls back to UTC if the local offset is
/// unavailable (rare; recorded as a known caveat rather than crashing).
pub fn today() -> String {
    let t = OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc());
    format!("{:04}-{:02}-{:02}", t.year(), t.month() as u8, t.day())
}

fn rel_for(date: &str) -> String {
    format!("activity/{date}.json")
}

/// Append an event to today's file (read-modify-write, atomic). Bounded by
/// MAX_EVENTS_PER_DAY; once reached, further events for the day are dropped
/// (the cap protects memory/disk; later specs can summarize instead).
pub fn append(app: &AppHandle, kind: &str, data: Option<serde_json::Value>) -> Result<(), StoreError> {
    let date = today();
    let rel = rel_for(&date);

    let mut day = read_json::<ActivityDay>(app, &rel)?
        .filter(|d| d.schema_version == ACTIVITY_VERSION)
        .unwrap_or_else(|| ActivityDay::empty(date.clone()));

    if day.events.len() >= MAX_EVENTS_PER_DAY {
        return Ok(());
    }

    let at = OffsetDateTime::now_utc().unix_timestamp();
    day.events.push(ActivityEvent {
        kind: kind.to_string(),
        at,
        data,
    });

    write_json_atomic(app, &rel, &day)
}

/// Read a day's events. `None` -> an empty day (so callers never special-case
/// "file missing"). `date` must be YYYY-MM-DD.
pub fn read_day(app: &AppHandle, date: &str) -> Result<ActivityDay, StoreError> {
    if !is_valid_date(date) {
        return Err(StoreError::Io(format!("invalid date: {date}")));
    }
    Ok(read_json::<ActivityDay>(app, &rel_for(date))?
        .unwrap_or_else(|| ActivityDay::empty(date.to_string())))
}

/// One day's progress summary: finished focus rounds and total focus minutes.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DaySummary {
    pub date: String,
    pub focus_count: u32,
    pub focus_minutes: u32,
}

/// Summarize the last `days` days (including today), oldest first. Reads each
/// day's file; missing days are zero-filled so the heatmap has a full grid.
/// `days` is clamped to a year so this can never read an unbounded range.
pub fn summary_range(app: &AppHandle, days: u32) -> Vec<DaySummary> {
    let days = days.clamp(1, 366);
    let today = OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc());
    let mut out = Vec::with_capacity(days as usize);
    for i in (0..days).rev() {
        let day = today.saturating_sub(time::Duration::days(i as i64));
        let date = format!("{:04}-{:02}-{:02}", day.year(), day.month() as u8, day.day());
        let (count, minutes) = match read_day(app, &date) {
            Ok(d) => {
                let count = d.events.iter().filter(|e| e.kind == "focus.completed").count() as u32;
                let minutes: u32 = d
                    .events
                    .iter()
                    .filter(|e| e.kind == "focus.completed")
                    .map(|e| {
                        e.data
                            .as_ref()
                            .and_then(|v| v.get("minutes"))
                            .and_then(|m| m.as_u64())
                            .unwrap_or(0) as u32
                    })
                    .sum();
                (count, minutes)
            }
            Err(_) => (0, 0),
        };
        out.push(DaySummary {
            date,
            focus_count: count,
            focus_minutes: minutes,
        });
    }
    out
}

/// Minimal YYYY-MM-DD shape check (defensive; the value reaches a file path).
fn is_valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    s.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && s.chars().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                c == '-'
            } else {
                c.is_ascii_digit()
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn today_is_well_formed() {
        let d = today();
        assert!(is_valid_date(&d), "today() must be YYYY-MM-DD, got {d}");
    }

    #[test]
    fn date_validation_rejects_bad_input() {
        assert!(is_valid_date("2026-01-02"));
        assert!(!is_valid_date("2026/01/02"));
        assert!(!is_valid_date("../etc"));
        assert!(!is_valid_date("2026-1-2"));
        assert!(!is_valid_date(""));
    }

    #[test]
    fn empty_day_has_version_and_no_events() {
        let d = ActivityDay::empty("2026-01-02".into());
        assert_eq!(d.schema_version, ACTIVITY_VERSION);
        assert!(d.events.is_empty());
    }
}
