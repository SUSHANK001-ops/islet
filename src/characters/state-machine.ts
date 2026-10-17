import type { Manifest } from "./bridge";

// Pick which animation STATE the character should play from app signals.
//
// Spec 6 keeps this deliberately small: it maps a few concrete situations to a
// state name and falls back to `idle`. Spec 7 (moods/growth/personality) layers
// richer mood logic on top (habits, late hours, skipped breaks). Keeping it a
// pure function here makes that extension testable and keeps the renderer dumb.

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

  // Completion celebration wins briefly, even in the notch.
  if (signals.justCompleted) return pick("celebrating");

  // Actively focusing -> working.
  if (signals.focusing) return pick("working");

  // Late night and idle -> sleeping (a gentle "go to bed" nudge).
  const lateNight = signals.hour >= 1 && signals.hour < 6;
  if (lateNight) return pick("sleeping");

  return FALLBACK;
}

/**
 * The notch only ever plays calm, loopable states (CHARACTERS.md: the closed
 * notch shows idle or the mood's idle-like state). Never celebrate/working in
 * the notch - those belong to the open panel where full animation is allowed.
 */
export function notchState(manifest: Manifest, signals: CharacterSignals): string {
  const has = (name: string) => name in manifest.states;
  const lateNight = signals.hour >= 1 && signals.hour < 6;
  if (lateNight && has("sleeping")) return "sleeping";
  return FALLBACK;
}
