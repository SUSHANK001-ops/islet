import type { DaySummary } from "./bridge";

// Pure progress math, kept separate so it is unit-testable without a DOM.

/** Total focus minutes across the summarized range. */
export function totalMinutes(days: DaySummary[]): number {
  return days.reduce((sum, d) => sum + d.focusMinutes, 0);
}

/**
 * Current streak = consecutive days with at least one finished round, counting
 * back from the most recent day. Today counts if it has activity; if today is
 * empty but yesterday had activity, the streak is whatever ran up to yesterday
 * (today has not broken it yet) - so we skip a trailing empty "today".
 */
export function currentStreak(days: DaySummary[]): number {
  if (days.length === 0) return 0;
  let streak = 0;
  let i = days.length - 1;
  // Allow today to be empty without breaking a prior streak.
  if (days[i].focusCount === 0) i -= 1;
  for (; i >= 0; i--) {
    if (days[i].focusCount > 0) streak += 1;
    else break;
  }
  return streak;
}

/** Longest streak anywhere in the range. */
export function longestStreak(days: DaySummary[]): number {
  let best = 0;
  let run = 0;
  for (const d of days) {
    if (d.focusCount > 0) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Bucket a day's focus count into a 0..4 heat level for the heatmap cells.
 * 0 = none, then 1-2, 3-4, 5-6, 7+ for a simple, readable gradient.
 */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}
