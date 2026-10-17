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

/** One-shot snapshot used by the status view and docs/perf-results.md. */
export function getSpikeReport(): Promise<SpikeReport> {
  return invoke("get_spike_report");
}

/** Names of connected monitors, for the monitor-choice setting. */
export function listMonitors(): Promise<string[]> {
  return invoke("list_monitors");
}

/** Choose the monitor the pill lives on. Empty string / null = primary. */
export function setMonitor(name: string | null): Promise<void> {
  return invoke("set_monitor", { name });
}

/** Set the notch horizontal position and re-place the pill immediately. */
export function setNotchPosition(
  position: "left" | "center" | "right"
): Promise<void> {
  return invoke("set_notch_position", { position });
}

// ---- Spec 2: persisted settings (Rust owns the file) ----

export interface PersistedSettings {
  schemaVersion: number;
  theme: "light" | "dark";
  monitorName: string | null;
  launchAtStartup: boolean;
  tabs: { id: string; enabled: boolean }[];
  notchPosition: "left" | "center" | "right";
  notchOpacity: number;
}

/** Load settings from disk (defaults on first run). */
export function loadSettings(): Promise<PersistedSettings> {
  return invoke("load_settings");
}

/** Save settings (debounced in Rust). Resolves to whether it hit disk. */
export function saveSettings(value: PersistedSettings): Promise<boolean> {
  return invoke("save_settings", { value });
}

/** Force-write settings now (call on unload so no pending change is lost). */
export function flushSettings(value: PersistedSettings): Promise<void> {
  return invoke("flush_settings", { value });
}
