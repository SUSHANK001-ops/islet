import { invoke } from "@tauri-apps/api/core";

// The frontend may ONLY call commands defined in src-tauri/src/commands.rs
// (AGENTS.md security rule). These thin wrappers are the single place the UI
// talks to the window/platform layer, so the allow-list stays easy to audit.

export interface SpikeReport {
  appName: string;
  monitorCount: number;
  activeMonitorName: string;
  scaleFactor: number;
  workAreaWidth: number;
  workAreaHeight: number;
  fullscreenAppActive: boolean;
}

/** Open the panel: grow the window and start accepting clicks. */
export function openPanel(): Promise<void> {
  return invoke("set_panel_open", { open: true });
}

/** Close the panel: shrink to the pill and become click-through again. */
export function closePanel(): Promise<void> {
  return invoke("set_panel_open", { open: false });
}

/** One-shot snapshot used by the spike panel and docs/perf-results.md. */
export function getSpikeReport(): Promise<SpikeReport> {
  return invoke("get_spike_report");
}
