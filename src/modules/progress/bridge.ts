import { invoke } from "@tauri-apps/api/core";

// Progress bridge: per-day focus summaries for the streak + heatmap. Rust reads
// the daily activity files and zero-fills missing days.

export interface DaySummary {
  date: string; // YYYY-MM-DD
  focusCount: number;
  focusMinutes: number;
}

/** Per-day summary for the last `days` days, oldest first. */
export function progressSummary(days: number): Promise<DaySummary[]> {
  return invoke("progress_summary", { days });
}
