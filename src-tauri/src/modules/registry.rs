//! Module registry + lifecycle.
//!
//! A module = its own folder with `start()`/`stop()`. Its lifecycle follows an
//! on/off switch (stored in settings). Modules never edit or call each other;
//! they publish to the Hub. This registry just tracks which modules exist and
//! their enabled state, and drives start/stop. Spec 2 ships the framework and a
//! no-op example; real modules arrive in later specs.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;

/// Lifecycle contract every module implements.
pub trait Module: Send + Sync {
    /// Stable id, also the settings/tab key.
    fn id(&self) -> &'static str;
    /// Begin doing work (register timers via the scheduler, etc.).
    fn start(&self);
    /// Stop all work and release resources. Must be idempotent.
    fn stop(&self);
}

/// What the frontend sees about a module.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModuleInfo {
    pub id: String,
    pub enabled: bool,
    pub running: bool,
}

struct Entry {
    module: Box<dyn Module>,
    enabled: bool,
    running: bool,
}

/// The registry. One instance is managed by Tauri.
#[derive(Default)]
pub struct Registry(Mutex<HashMap<String, Entry>>);

impl Registry {
    /// Add a module, with its initial enabled state (from settings).
    pub fn register(&self, module: Box<dyn Module>, enabled: bool) {
        if let Ok(mut map) = self.0.lock() {
            let id = module.id().to_string();
            map.insert(
                id,
                Entry {
                    module,
                    enabled,
                    running: false,
                },
            );
        }
    }

    /// Start every enabled module that is not already running.
    pub fn start_enabled(&self) {
        if let Ok(mut map) = self.0.lock() {
            for entry in map.values_mut() {
                if entry.enabled && !entry.running {
                    entry.module.start();
                    entry.running = true;
                }
            }
        }
    }

    /// Flip a module on/off and start/stop it to match. Returns the new state.
    pub fn set_enabled(&self, id: &str, enabled: bool) -> Option<ModuleInfo> {
        let mut map = self.0.lock().ok()?;
        let entry = map.get_mut(id)?;
        entry.enabled = enabled;
        if enabled && !entry.running {
            entry.module.start();
            entry.running = true;
        } else if !enabled && entry.running {
            entry.module.stop();
            entry.running = false;
        }
        Some(ModuleInfo {
            id: id.to_string(),
            enabled: entry.enabled,
            running: entry.running,
        })
    }

    /// Stop all running modules (shutdown).
    pub fn stop_all(&self) {
        if let Ok(mut map) = self.0.lock() {
            for entry in map.values_mut() {
                if entry.running {
                    entry.module.stop();
                    entry.running = false;
                }
            }
        }
    }

    /// Snapshot of all modules for the frontend.
    pub fn list(&self) -> Vec<ModuleInfo> {
        self.0
            .lock()
            .map(|map| {
                let mut v: Vec<ModuleInfo> = map
                    .values()
                    .map(|e| ModuleInfo {
                        id: e.module.id().to_string(),
                        enabled: e.enabled,
                        running: e.running,
                    })
                    .collect();
                v.sort_by(|a, b| a.id.cmp(&b.id));
                v
            })
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    /// Test module that counts start/stop calls.
    struct Counter {
        starts: Arc<AtomicU32>,
        stops: Arc<AtomicU32>,
    }
    impl Module for Counter {
        fn id(&self) -> &'static str {
            "counter"
        }
        fn start(&self) {
            self.starts.fetch_add(1, Ordering::SeqCst);
        }
        fn stop(&self) {
            self.stops.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[test]
    fn enabled_module_starts_and_toggles() {
        let starts = Arc::new(AtomicU32::new(0));
        let stops = Arc::new(AtomicU32::new(0));
        let reg = Registry::default();
        reg.register(
            Box::new(Counter {
                starts: starts.clone(),
                stops: stops.clone(),
            }),
            true,
        );

        reg.start_enabled();
        assert_eq!(starts.load(Ordering::SeqCst), 1);
        // Starting again does not double-start.
        reg.start_enabled();
        assert_eq!(starts.load(Ordering::SeqCst), 1);

        // Turn off -> stop once.
        let info = reg.set_enabled("counter", false).unwrap();
        assert!(!info.enabled && !info.running);
        assert_eq!(stops.load(Ordering::SeqCst), 1);

        // Turn back on -> start again.
        reg.set_enabled("counter", true);
        assert_eq!(starts.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn disabled_module_does_not_start() {
        let starts = Arc::new(AtomicU32::new(0));
        let stops = Arc::new(AtomicU32::new(0));
        let reg = Registry::default();
        reg.register(
            Box::new(Counter {
                starts: starts.clone(),
                stops,
            }),
            false,
        );
        reg.start_enabled();
        assert_eq!(starts.load(Ordering::SeqCst), 0);
        assert_eq!(reg.list().len(), 1);
    }
}
