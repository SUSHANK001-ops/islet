//! The focus module: wires the pure engine to the single scheduler, the shared
//! hub, the activity log, Windows notifications, and session/power pause.
//!
//! Lifecycle (Module trait): `start()` subscribes to the scheduler and the
//! session listener; `stop()` unsubscribes. The engine itself is driven only by
//! scheduler ticks, so there are no extra timers (performance budget).

pub mod engine;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::modules::hub::Hub;
use crate::modules::registry::Module;
use crate::platform::session::{self, SessionEvent};
use crate::scheduler::Scheduler;
use crate::store::activity;

use engine::{FocusConfig, FocusEngine, FocusState, Phase, Transition};

/// Shared focus state + the engine, behind one lock.
pub struct FocusModule {
    app: AppHandle,
    engine: Arc<Mutex<FocusEngine>>,
    tick_sub: AtomicU64,
    started: Arc<Mutex<bool>>,
}

impl FocusModule {
    pub fn new(app: AppHandle, config: FocusConfig) -> Self {
        FocusModule {
            app,
            engine: Arc::new(Mutex::new(FocusEngine::new(config))),
            tick_sub: AtomicU64::new(0),
            started: Arc::new(Mutex::new(false)),
        }
    }

    /// Current state snapshot (for the get_state command).
    pub fn state(&self) -> FocusState {
        self.engine
            .lock()
            .map(|e| e.state())
            .unwrap_or_else(|_| FocusEngine::new(FocusConfig::default()).state())
    }

    /// Apply a mutation to the engine, then publish the result everywhere.
    pub fn with_engine<R>(&self, f: impl FnOnce(&mut FocusEngine) -> R) -> R {
        let result = {
            let mut guard = self.engine.lock().expect("focus engine lock");
            f(&mut guard)
        };
        self.publish();
        result
    }

    /// Push the current state to the hub and the frontend. Called after every
    /// change and on each tick. The frontend listens only while visible.
    fn publish(&self) {
        let state = self.state();
        if let Some(hub) = self.app.try_state::<Hub>() {
            hub.update(|s| {
                s.focus_remaining_secs = if state.phase == Phase::Idle {
                    None
                } else {
                    Some(state.remaining_secs)
                };
                s.focus_rounds_today = state.rounds_today;
            });
        }
        let _ = self.app.emit("islet://focus-state", state);
    }

    /// React to a completed phase: notify + write to the activity log.
    fn on_transition(&self, t: Transition) {
        match t {
            Transition::WorkCompleted { minutes } => {
                let data = serde_json::json!({ "minutes": minutes });
                let _ = activity::append(&self.app, "focus.completed", Some(data));
                self.notify("Focus round done", "Time for a break.");
            }
            Transition::BreakCompleted => {
                let _ = activity::append(&self.app, "break.taken", None);
                self.notify("Break over", "Back to focus.");
            }
        }
    }

    /// Send a Windows notification. Best-effort; a missing permission or plugin
    /// error is non-fatal (the timer keeps working).
    fn notify(&self, title: &str, body: &str) {
        let _ = self
            .app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show();
    }
}

impl Module for FocusModule {
    fn id(&self) -> &'static str {
        "focus"
    }

    fn start(&self) {
        // Idempotent.
        {
            let mut started = self.started.lock().expect("focus started lock");
            if *started {
                return;
            }
            *started = true;
        }

        // Subscribe to the one scheduler. Each tick advances the engine and, on
        // a transition, fires the notification + activity write.
        if let Some(sched) = self.app.try_state::<Scheduler>() {
            let engine = Arc::clone(&self.engine);
            let app = self.app.clone();
            let id = sched.subscribe(Box::new(move |secs| {
                let transition = {
                    let mut e = match engine.lock() {
                        Ok(e) => e,
                        Err(_) => return,
                    };
                    e.tick(secs as u32)
                };
                // Publish + react outside the engine lock.
                republish(&app);
                if let Some(t) = transition {
                    react(&app, t);
                }
            }));
            self.tick_sub.store(id, Ordering::SeqCst);
        }

        // Session/power listener: pause on lock/sleep, resume on unlock/wake.
        let (tx, rx) = std::sync::mpsc::channel::<SessionEvent>();
        session::start(tx);
        let engine = Arc::clone(&self.engine);
        let app = self.app.clone();
        std::thread::spawn(move || {
            // This thread lives for the app's lifetime; it ends when the
            // channel closes (listener thread gone).
            while let Ok(evt) = rx.recv() {
                if let Ok(mut e) = engine.lock() {
                    match evt {
                        SessionEvent::Pause => e.pause(),
                        SessionEvent::Resume => e.resume(),
                    }
                }
                republish(&app);
            }
        });
    }

    fn stop(&self) {
        let mut started = self.started.lock().expect("focus started lock");
        if !*started {
            return;
        }
        *started = false;
        if let Some(sched) = self.app.try_state::<Scheduler>() {
            sched.unsubscribe(self.tick_sub.load(Ordering::SeqCst));
        }
        // The session listener thread ends with the app; pausing the timer here
        // keeps state consistent when the module is turned off.
        if let Ok(mut e) = self.engine.lock() {
            e.pause();
        }
    }
}

// Free helpers so the tick/session closures do not need `&self` (which would
// require cloning the whole module). They re-resolve state from the app handle.

fn republish(app: &AppHandle) {
    if let Some(fm) = app.try_state::<FocusHandle>() {
        fm.0.publish();
    }
}

fn react(app: &AppHandle, t: Transition) {
    if let Some(fm) = app.try_state::<FocusHandle>() {
        fm.0.on_transition(t);
    }
}

/// A sharable handle to the focus module, stored in Tauri state so the free
/// helpers above (used inside the scheduler callback) can reach it.
pub struct FocusHandle(pub Arc<FocusModule>);
