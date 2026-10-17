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

/** Combined signals object for the renderer (recomputed reactively). */
export function characterSignals(closed: boolean): CharacterSignals {
  return {
    focusing: focusing.value,
    justCompleted: justCompleted.value,
    hour: hour.value,
    closed,
  };
}

// Expose the reactive pieces so components can subscribe (reading .value).
export const sigFocusing = focusing;
export const sigJustCompleted = justCompleted;
export const sigHour = hour;

let wired = false;
let completeTimer: ReturnType<typeof setTimeout> | null = null;
let hourTimer: ReturnType<typeof setInterval> | null = null;

/** Wire the focus-state listener once. Safe outside Tauri (no-op). */
export function initCharacterSignals(): void {
  if (wired) return;
  wired = true;

  let prevRounds = -1;

  void listen<FocusState>("islet://focus-state", (e) => {
    const st = e.payload;
    focusing.value = st.phase === "work" && st.runState === "running";

    // A newly completed round (completedRounds went up) triggers a short
    // celebration, then returns to the normal state.
    if (prevRounds >= 0 && st.completedRounds > prevRounds) {
      justCompleted.value = true;
      if (completeTimer) clearTimeout(completeTimer);
      completeTimer = setTimeout(() => {
        justCompleted.value = false;
      }, 4000);
    }
    prevRounds = st.completedRounds;
  }).catch(() => {});

  // Refresh the local hour every 10 minutes so the "sleeping late" cue is
  // correct without a tight loop. Cheap and only affects which state shows.
  if (typeof window !== "undefined") {
    hourTimer = setInterval(() => {
      hour.value = new Date().getHours();
    }, 10 * 60 * 1000);
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
