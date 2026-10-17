import type { Manifest } from "./bridge";
import { computeMood, moodState, type MoodInput } from "./mood";

// Pick which animation STATE the character should play from app signals.
//
// Spec 6 maps a few concrete situations to a state name. Spec 7 layers mood on
// top: when nothing more specific applies (not celebrating/working), the mood
// computed from real habits chooses the resting state via the pack's mood map.
// Keeping it pure here makes it testable and keeps the renderer dumb.

/** The coarse situation the app is in, fed from the hub / focus module. */
export interface CharacterSignals {
  /** A focus round is actively running. */
  focusing: boolean;
  /** A round just completed (celebrate briefly). */
  justCompleted: boolean;
  /** Local hour 0..23, for the "sleeping late" cue. */
  hour: number;
  /** True while the panel is closed (notch mode). */
  closed: boolean;
  /** Focus rounds finished today (mood input). */
  roundsToday?: number;
  /** Breaks skipped today (mood input). */
  skippedBreaks?: number;
  /** Minutes idle since last interaction (mood input). */
  idleMinutes?: number;
}

/** Build the mood input from the signals (defaults keep it safe when unset). */
function moodInputFrom(signals: CharacterSignals): MoodInput {
  return {
    roundsToday: signals.roundsToday ?? 0,
    skippedBreaks: signals.skippedBreaks ?? 0,
    idleMinutes: signals.idleMinutes ?? 0,
    hour: signals.hour,
    justCompleted: signals.justCompleted,
  };
}

/** The five required states always exist (validated in Rust). */
const FALLBACK = "idle";

/**
 * Resolve the state name to play. The returned name is guaranteed to exist in
 * the manifest: if a preferred state is somehow missing we fall back to idle,
 * matching CHARACTERS.md ("if an optional state is missing, use idle").
 */
export function resolveState(
  manifest: Manifest,
  signals: CharacterSignals
): string {
  const has = (name: string) => name in manifest.states;
  const pick = (name: string) => (has(name) ? name : FALLBACK);

  // Completion celebration wins briefly, even over mood.
  if (signals.justCompleted) return pick("celebrating");

  // Actively focusing -> working.
  if (signals.focusing) return pick("working");

  // Otherwise the resting state follows the computed mood (Spec 7). The mood is
  // derived from real habits and mapped to a state via the pack's mood map.
  const mood = computeMood(moodInputFrom(signals));
  return moodState(manifest, mood);
}

/**
 * The notch only ever plays calm, loopable states (CHARACTERS.md: the closed
 * notch shows idle or the mood's idle-like state). Never celebrate/working in
 * the notch - those belong to the open panel where full animation is allowed.
 */
export function notchState(manifest: Manifest, signals: CharacterSignals): string {
  const has = (name: string) => name in manifest.states;
  // The notch reflects mood, but only through calm, loopable states. A tired
  // mood may sleep; anything livelier still reads as idle in the tiny notch.
  const mood = computeMood(moodInputFrom(signals));
  if (mood === "tired" && has("sleeping")) return "sleeping";
  return FALLBACK;
}
