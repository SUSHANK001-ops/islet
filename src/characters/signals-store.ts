import { signal } from "@preact/signals";
import { listen } from "@tauri-apps/api/event";
import type { FocusState } from "../modules/focus/bridge";
import type { CharacterSignals } from "./state-machine";

// Produces the CharacterSignals the renderer reads, from app events. The
// character reacts to the focus module via the activity/hub surface - it never
// imports the focus module's internals (AGENTS.md: modules publish, others
// read). Here we only listen to the already-public "islet://focus-state" event.

const focusing = signal(false);
const justCompleted = signal(false);
const hour = signal(new Date().getHours());
const roundsToday = signal(0);
const skippedBreaks = signal(0);
const idleMinutes = signal(0);

/** Combined signals object for the renderer (recomputed reactively). */
export function characterSignals(closed: boolean): CharacterSignals {
  return {
    focusing: focusing.value,
    justCompleted: justCompleted.value,
    hour: hour.value,
    closed,
    roundsToday: roundsToday.value,
    skippedBreaks: skippedBreaks.value,
    idleMinutes: idleMinutes.value,
  };
}

// Expose the reactive pieces so components can subscribe (reading .value).
export const sigFocusing = focusing;
export const sigJustCompleted = justCompleted;
export const sigHour = hour;
export const sigRoundsToday = roundsToday;

let wired = false;
let completeTimer: ReturnType<typeof setTimeout> | null = null;
let hourTimer: ReturnType<typeof setInterval> | null = null;

/** Wire the focus-state listener once. Safe outside Tauri (no-op). */
export function initCharacterSignals(): void {
  if (wired) return;
  wired = true;

  let prevRoundsToday = -1;
  let prevPhase = "idle";

  void listen<FocusState>("islet://focus-state", (e) => {
    const st = e.payload;
    focusing.value = st.phase === "work" && st.runState === "running";
    roundsToday.value = st.roundsToday;

    // A newly completed round (roundsToday went up) triggers a short
    // celebration, then returns to the normal state.
    if (prevRoundsToday >= 0 && st.roundsToday > prevRoundsToday) {
      justCompleted.value = true;
      if (completeTimer) clearTimeout(completeTimer);
      completeTimer = setTimeout(() => {
        justCompleted.value = false;
      }, 4000);
    }
    prevRoundsToday = st.roundsToday;

    // Skipped break: a break phase was cut short back to work without the
    // break elapsing. Heuristic: we left a break phase straight into work
    // while time remained. Tracked loosely for the "tired" mood cue.
    if (
      (prevPhase === "shortBreak" || prevPhase === "longBreak") &&
      st.phase === "work" &&
      st.remainingSecs === st.totalSecs
    ) {
      // Only counts as "skipped" if the break still had time left; the engine
      // resets remaining to total on a fresh work phase, so we approximate.
      skippedBreaks.value = skippedBreaks.value + 1;
    }
    prevPhase = st.phase;

    // Any focus activity counts as interaction: reset the idle clock.
    idleMinutes.value = 0;
  }).catch(() => {});

  // Refresh the local hour every 10 minutes so the "sleeping late" cue is
  // correct without a tight loop. Also advance the idle clock. Cheap and only
  // affects which resting state shows.
  if (typeof window !== "undefined") {
    hourTimer = setInterval(() => {
      hour.value = new Date().getHours();
      idleMinutes.value = idleMinutes.value + 10;
    }, 10 * 60 * 1000);

    // Reset idle on real user interaction with the panel.
    const resetIdle = () => {
      idleMinutes.value = 0;
    };
    window.addEventListener("pointerdown", resetIdle, { passive: true });
    window.addEventListener("keydown", resetIdle, { passive: true });
  }
}

/** Teardown (tests / hot reload). */
export function stopCharacterSignals(): void {
  if (completeTimer) clearTimeout(completeTimer);
  if (hourTimer) clearInterval(hourTimer);
  completeTimer = null;
  hourTimer = null;
  wired = false;
}
