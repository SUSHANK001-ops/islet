//! Pure focus-timer state machine. No wall clock, no threads: it advances only
//! when `tick(secs)` is called, which makes every transition unit-testable.
//! The module layer feeds it ticks from the single scheduler and reacts to the
//! transitions it reports (notify, publish to hub, write activity).

use serde::{Deserialize, Serialize};

/// What phase the timer is in.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Idle,
    Work,
    ShortBreak,
    LongBreak,
}

/// Running vs paused (only meaningful when not Idle).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RunState {
    Running,
    Paused,
}

/// Config, sourced from settings. Durations in minutes, counts in rounds.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FocusConfig {
    pub work_minutes: u32,
    pub short_break_minutes: u32,
    pub long_break_minutes: u32,
    /// Work rounds before a long break.
    pub rounds_before_long_break: u32,
}

impl Default for FocusConfig {
    fn default() -> Self {
        FocusConfig {
            work_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            rounds_before_long_break: 4,
        }
    }
}

/// A transition the engine reports so the module can react (notify, log).
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Transition {
    /// A work round finished; value = the completed round's length in minutes
    /// (so the activity log can total real focus minutes for growth/progress).
    WorkCompleted { minutes: u32 },
    /// A break finished.
    BreakCompleted,
}

/// Public snapshot for the frontend / hub.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FocusState {
    pub phase: Phase,
    pub run_state: RunState,
    pub remaining_secs: u32,
    pub total_secs: u32,
    /// Completed work rounds in the current pomodoro cycle (0..rounds).
    pub completed_rounds: u32,
    /// Completed work rounds today (tally for the hub/activity).
    pub rounds_today: u32,
}

pub struct FocusEngine {
    config: FocusConfig,
    phase: Phase,
    run: RunState,
    remaining: u32,
    total: u32,
    completed_rounds: u32,
    rounds_today: u32,
}

impl FocusEngine {
    pub fn new(config: FocusConfig) -> Self {
        FocusEngine {
            config,
            phase: Phase::Idle,
            run: RunState::Paused,
            remaining: 0,
            total: 0,
            completed_rounds: 0,
            rounds_today: 0,
        }
    }

    /// Replace config (e.g. settings changed). Does not disturb a running timer
    /// beyond the current phase; new durations apply to the next phase.
    /// Wired when focus settings become editable (next spec); kept now so the
    /// engine is a complete unit.
    #[allow(dead_code)]
    pub fn set_config(&mut self, config: FocusConfig) {
        self.config = config;
    }

    pub fn state(&self) -> FocusState {
        FocusState {
            phase: self.phase,
            run_state: self.run,
            remaining_secs: self.remaining,
            total_secs: self.total,
            completed_rounds: self.completed_rounds,
            rounds_today: self.rounds_today,
        }
    }

    /// Start a fresh work round (also used by presets, which set work_minutes).
    pub fn start_work(&mut self, work_minutes: u32) {
        self.config.work_minutes = work_minutes;
        self.enter(Phase::Work);
    }

    /// Start with the current config's work length. Used by tests and by a
    /// future "resume default round" path; the command layer uses `start_work`.
    #[allow(dead_code)]
    pub fn start(&mut self) {
        self.enter(Phase::Work);
    }

    pub fn pause(&mut self) {
        if self.phase != Phase::Idle {
            self.run = RunState::Paused;
        }
    }

    pub fn resume(&mut self) {
        if self.phase != Phase::Idle {
            self.run = RunState::Running;
        }
    }

    pub fn reset(&mut self) {
        self.phase = Phase::Idle;
        self.run = RunState::Paused;
        self.remaining = 0;
        self.total = 0;
        self.completed_rounds = 0;
    }

    /// Reset the daily tally (call on date rollover). Wired when the scheduler
    /// gains a midnight signal (Spec 9 progress); kept now for completeness.
    #[allow(dead_code)]
    pub fn reset_daily(&mut self) {
        self.rounds_today = 0;
    }

    fn enter(&mut self, phase: Phase) {
        let minutes = match phase {
            Phase::Work => self.config.work_minutes,
            Phase::ShortBreak => self.config.short_break_minutes,
            Phase::LongBreak => self.config.long_break_minutes,
            Phase::Idle => 0,
        };
        self.phase = phase;
        self.total = minutes * 60;
        self.remaining = self.total;
        self.run = if phase == Phase::Idle {
            RunState::Paused
        } else {
            RunState::Running
        };
    }

    /// Advance by `secs` seconds. Returns a transition if a phase completed.
    /// Only advances while Running and not Idle.
    pub fn tick(&mut self, secs: u32) -> Option<Transition> {
        if self.phase == Phase::Idle || self.run != RunState::Running {
            return None;
        }
        if secs < self.remaining {
            self.remaining -= secs;
            return None;
        }
        // Phase elapsed.
        self.remaining = 0;
        match self.phase {
            Phase::Work => {
                // The length of the round that just finished (before we enter
                // the break, which overwrites total). Used for activity totals.
                let minutes = self.total / 60;
                self.completed_rounds += 1;
                self.rounds_today += 1;
                // Choose the break type based on completed rounds.
                if self.completed_rounds >= self.config.rounds_before_long_break {
                    self.completed_rounds = 0;
                    self.enter(Phase::LongBreak);
                } else {
                    self.enter(Phase::ShortBreak);
                }
                Some(Transition::WorkCompleted { minutes })
            }
            Phase::ShortBreak | Phase::LongBreak => {
                self.enter(Phase::Work);
                Some(Transition::BreakCompleted)
            }
            Phase::Idle => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> FocusConfig {
        // Tiny durations so tests advance quickly: 1 min work, 1 min breaks,
        // long break after 2 rounds.
        FocusConfig {
            work_minutes: 1,
            short_break_minutes: 1,
            long_break_minutes: 1,
            rounds_before_long_break: 2,
        }
    }

    #[test]
    fn starts_idle() {
        let mut e = FocusEngine::new(cfg());
        assert_eq!(e.state().phase, Phase::Idle);
        assert_eq!(e.tick(10), None, "idle does not tick down");
    }

    #[test]
    fn work_counts_down_and_completes_to_short_break() {
        let mut e = FocusEngine::new(cfg());
        e.start();
        assert_eq!(e.state().phase, Phase::Work);
        assert_eq!(e.state().remaining_secs, 60);
        assert_eq!(e.tick(59), None);
        assert_eq!(e.state().remaining_secs, 1);
        let t = e.tick(1);
        assert_eq!(t, Some(Transition::WorkCompleted { minutes: 1 }));
        assert_eq!(e.state().phase, Phase::ShortBreak);
        assert_eq!(e.state().rounds_today, 1);
    }

    #[test]
    fn pause_freezes_countdown() {
        let mut e = FocusEngine::new(cfg());
        e.start();
        e.tick(10);
        e.pause();
        let before = e.state().remaining_secs;
        assert_eq!(e.tick(30), None, "paused ignores ticks");
        assert_eq!(e.state().remaining_secs, before);
        e.resume();
        e.tick(5);
        assert_eq!(e.state().remaining_secs, before - 5);
    }

    #[test]
    fn long_break_after_configured_rounds() {
        let mut e = FocusEngine::new(cfg()); // long break after 2 rounds
        // Round 1 work -> short break.
        e.start();
        assert_eq!(e.tick(60), Some(Transition::WorkCompleted { minutes: 1 }));
        assert_eq!(e.state().phase, Phase::ShortBreak);
        // Break -> back to work.
        assert_eq!(e.tick(60), Some(Transition::BreakCompleted));
        assert_eq!(e.state().phase, Phase::Work);
        // Round 2 work -> LONG break (2 rounds reached).
        assert_eq!(e.tick(60), Some(Transition::WorkCompleted { minutes: 1 }));
        assert_eq!(e.state().phase, Phase::LongBreak);
        assert_eq!(e.state().rounds_today, 2);
    }

    #[test]
    fn reset_returns_to_idle() {
        let mut e = FocusEngine::new(cfg());
        e.start();
        e.tick(30);
        e.reset();
        assert_eq!(e.state().phase, Phase::Idle);
        assert_eq!(e.state().remaining_secs, 0);
    }

    #[test]
    fn preset_sets_work_length() {
        let mut e = FocusEngine::new(cfg());
        e.start_work(10);
        assert_eq!(e.state().total_secs, 600);
        assert_eq!(e.state().phase, Phase::Work);
    }
}
