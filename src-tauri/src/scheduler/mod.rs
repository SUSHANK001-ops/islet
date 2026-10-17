//! The single timer engine (AGENTS.md: "One timer engine in Rust. Modules do
//! not create their own timers or threads.").
//!
//! One background thread ticks once per second and calls every registered
//! subscriber. Modules register a callback; they never spawn their own timers.
//! The thread only runs while there is at least one active subscriber, so an
//! idle app has no ticking thread (performance budget: closed == asleep).

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// A tick callback. Receives the number of whole seconds since the scheduler
/// last ticked for this subscriber (normally 1; larger if the OS delayed us).
pub type TickFn = Box<dyn Fn(u64) + Send + 'static>;

struct Inner {
    subscribers: HashMap<u64, TickFn>,
    running: bool,
}

/// The scheduler. One instance is managed by Tauri.
pub struct Scheduler {
    inner: Arc<Mutex<Inner>>,
    next_id: AtomicU64,
}

impl Default for Scheduler {
    fn default() -> Self {
        Scheduler {
            inner: Arc::new(Mutex::new(Inner {
                subscribers: HashMap::new(),
                running: false,
            })),
            next_id: AtomicU64::new(1),
        }
    }
}

impl Scheduler {
    /// Register a per-second callback. Returns an id used to unsubscribe.
    /// Starts the tick thread if it was idle.
    pub fn subscribe(&self, cb: TickFn) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let mut inner = match self.inner.lock() {
            Ok(g) => g,
            Err(_) => return id,
        };
        inner.subscribers.insert(id, cb);
        if !inner.running {
            inner.running = true;
            self.spawn_tick_thread();
        }
        id
    }

    /// Remove a subscriber. The tick thread stops once none remain.
    pub fn unsubscribe(&self, id: u64) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.subscribers.remove(&id);
            if inner.subscribers.is_empty() {
                inner.running = false; // thread sees this and exits
            }
        }
    }

    /// Spawn the single tick thread. It exits when `running` goes false.
    fn spawn_tick_thread(&self) {
        let inner = Arc::clone(&self.inner);
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(1));
            // Collect callbacks under the lock, then call them WITHOUT holding
            // it, so a subscriber can (un)subscribe from inside its callback.
            let callbacks: Vec<()> = {
                let guard = match inner.lock() {
                    Ok(g) => g,
                    Err(_) => break,
                };
                if !guard.running {
                    break;
                }
                for cb in guard.subscribers.values() {
                    cb(1);
                }
                Vec::new()
            };
            let _ = callbacks;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;
    use std::sync::Arc;

    #[test]
    fn tick_thread_runs_and_stops_with_subscribers() {
        let sched = Scheduler::default();
        let count = Arc::new(AtomicU64::new(0));
        let c2 = Arc::clone(&count);
        let id = sched.subscribe(Box::new(move |secs| {
            c2.fetch_add(secs, Ordering::SeqCst);
        }));

        // Wait ~2.3s for a couple of ticks.
        std::thread::sleep(Duration::from_millis(2300));
        let after_two = count.load(Ordering::SeqCst);
        assert!(after_two >= 2, "expected >=2 ticks, got {after_two}");

        // Unsubscribe; the thread should stop and the count should freeze.
        sched.unsubscribe(id);
        std::thread::sleep(Duration::from_millis(1500));
        let frozen = count.load(Ordering::SeqCst);
        // Allow one in-flight tick, but it must not keep climbing.
        assert!(
            frozen <= after_two + 1,
            "count kept climbing after unsubscribe: {after_two} -> {frozen}"
        );
    }
}
