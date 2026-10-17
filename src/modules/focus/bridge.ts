import { invoke } from "@tauri-apps/api/core";

// Focus timer bridge. The Rust engine is the source of truth; these call the
// allow-listed focus_* commands and the UI subscribes to "islet://focus-state".

export type Phase = "idle" | "work" | "shortBreak" | "longBreak";
export type RunState = "running" | "paused";

export interface FocusState {
  phase: Phase;
  runState: RunState;
  remainingSecs: number;
  totalSecs: number;
  completedRounds: number;
  roundsToday: number;
}

export function focusStart(minutes: number): Promise<FocusState> {
  return invoke("focus_start", { minutes });
}

export function focusPause(): Promise<FocusState> {
  return invoke("focus_pause");
}

export function focusResume(): Promise<FocusState> {
  return invoke("focus_resume");
}

export function focusReset(): Promise<FocusState> {
  return invoke("focus_reset");
}

export function focusGetState(): Promise<FocusState> {
  return invoke("focus_get_state");
}
