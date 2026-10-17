import type { Manifest } from "./bridge";

// Spec 7: moods, growth, personality. Pure functions only - the APP decides the
// mood from the user's real habits; the PACK only says which animation STATE to
// show for each mood (CHARACTERS.md). A pack can never change how a mood is
// calculated. Growth stage comes from total focus minutes. Personality (three
// 0..1 numbers) nudges small timings, nothing more.

/** The four moods the app computes. Mirrors CHARACTERS.md mood keys. */
export type Mood = "happy" | "tired" | "bored" | "proud";

/** Real-habit inputs the mood is derived from. All app-owned, never pack-owned. */
export interface MoodInput {
  /** Focus rounds finished today. */
  roundsToday: number;
  /** Breaks skipped today (started a new round without taking the break). */
  skippedBreaks: number;
  /** Minutes since the last user interaction (idle). */
  idleMinutes: number;
  /** Local hour 0..23. */
  hour: number;
  /** A round just completed (recent celebration window). */
  justCompleted: boolean;
}

/**
 * Compute the mood from habits. Order matters: proud (just did well) beats
 * tired (late/idle) beats bored (long idle, nothing done) beats the happy
 * default. This is intentionally simple and fully testable.
 */
export function computeMood(input: MoodInput): Mood {
  // Proud: a fresh completion, or a genuinely productive day.
  if (input.justCompleted || input.roundsToday >= 4) return "proud";

  // Tired: the small hours, or a long idle stretch, or breaks skipped a lot.
  const lateNight = input.hour >= 1 && input.hour < 6;
  if (lateNight || input.idleMinutes >= 30 || input.skippedBreaks >= 3) {
    return "tired";
  }

  // Bored: idle a while with nothing accomplished yet.
  if (input.idleMinutes >= 10 && input.roundsToday === 0) return "bored";

  return "happy";
}

/**
 * Map a mood to an animation STATE using the pack's mood map, falling back to
 * idle if the pack does not define that mood or the target state is missing
 * (CHARACTERS.md: missing optional state -> idle).
 */
export function moodState(manifest: Manifest, mood: Mood): string {
  const target = manifest.moods?.[mood];
  if (target && target in manifest.states) return target;
  return "idle";
}

/** A growth stage: an id and the sheet to draw for it. */
export interface Stage {
  id: string;
  sheet: string;
}

/**
 * Resolve the current growth stage from total focus minutes. Returns the
 * highest stage whose `minFocusMinutes` the user has reached. If the pack
 * defines no stages, returns null (the renderer uses the main sheet).
 * If a stage's sheet is missing, callers fall back to the previous stage
 * (handled where the sheet is actually loaded).
 */
export function resolveStage(manifest: Manifest, totalFocusMinutes: number): Stage | null {
  if (!manifest.stages || manifest.stages.length === 0) return null;
  // Stages are authored in ascending order, but sort defensively.
  const ordered = [...manifest.stages].sort(
    (a, b) => a.minFocusMinutes - b.minFocusMinutes
  );
  let current: Stage | null = null;
  for (const s of ordered) {
    if (totalFocusMinutes >= s.minFocusMinutes) {
      current = { id: s.id, sheet: s.sheet };
    }
  }
  return current ?? { id: ordered[0].id, sheet: ordered[0].sheet };
}

/**
 * Personality -> timing nudges. The three numbers are clamped to 0..1 (values
 * outside the range are clamped, per CHARACTERS.md). Higher energy fidgets more
 * often; higher lazy slows idle animation; chatty shortens the gap between
 * little "peek" gestures. These only change timings, never behavior.
 */
export interface TimingNudges {
  /** Multiplier on the idle frame interval (>1 = slower, lazier). */
  idleIntervalScale: number;
  /** Seconds between spontaneous "fidget" gestures. */
  fidgetEverySecs: number;
}

export function timingNudges(manifest: Manifest): TimingNudges {
  const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
  const energy = clamp01(manifest.personality?.energy ?? 0.5);
  const lazy = clamp01(manifest.personality?.lazy ?? 0.5);

  // Lazy slows idle by up to ~1.6x; energy speeds it back up a little.
  const idleIntervalScale = 1 + lazy * 0.6 - energy * 0.2;
  // Energetic characters fidget as often as every ~6s; calm ones ~30s.
  const fidgetEverySecs = Math.round(30 - energy * 24);

  return {
    idleIntervalScale: Math.max(0.5, idleIntervalScale),
    fidgetEverySecs: Math.max(6, fidgetEverySecs),
  };
}
