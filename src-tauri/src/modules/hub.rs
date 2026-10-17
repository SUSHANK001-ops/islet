//! The shared hub: a small, in-memory place where modules publish values and
//! other parts read them. Modules NEVER call each other directly (AGENTS.md
//! module rule); they only publish here and read here.
//!
//! Kept deliberately tiny and typed. Values are the few cross-cutting facts the
//! shell and character care about: task count, next event label, focus clock,
//! and a daily tally. Later specs fill these in.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HubSnapshot {
    /// Open task count (Tasks module).
    pub open_tasks: u32,
    /// Label of the next scheduled thing, if any (Focus module, etc.).
    pub next_event: Option<String>,
    /// Remaining focus seconds, if a round is running (Focus module).
    pub focus_remaining_secs: Option<u32>,
    /// Count of finished focus rounds today (tally).
    pub focus_rounds_today: u32,
}

/// Thread-safe hub state. One instance is managed by Tauri.
#[derive(Default)]
pub struct Hub(Mutex<HubSnapshot>);

impl Hub {
    /// Read a clone of the current snapshot.
    pub fn snapshot(&self) -> HubSnapshot {
        self.0.lock().map(|g| g.clone()).unwrap_or_default()
    }

    /// Update the snapshot via a closure. Returns the new snapshot.
    pub fn update(&self, f: impl FnOnce(&mut HubSnapshot)) -> HubSnapshot {
        match self.0.lock() {
            Ok(mut g) => {
                f(&mut g);
                g.clone()
            }
            Err(_) => HubSnapshot::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_empty() {
        let hub = Hub::default();
        assert_eq!(hub.snapshot(), HubSnapshot::default());
    }

    #[test]
    fn update_is_visible_in_snapshot() {
        let hub = Hub::default();
        hub.update(|s| {
            s.open_tasks = 3;
            s.focus_rounds_today = 2;
        });
        let snap = hub.snapshot();
        assert_eq!(snap.open_tasks, 3);
        assert_eq!(snap.focus_rounds_today, 2);
    }
}
