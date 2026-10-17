import { signal, effect } from "@preact/signals";
import { loadSettings, saveSettings } from "./window-bridge";

// Settings store. Spec 2: the backing is now versioned JSON on disk (Rust owns
// the file). The public API (`settings` signal, `updateSettings`, tab helpers)
// is unchanged from Spec 1, so callers did not change. Load happens once at
// startup; changes are saved (debounced in Rust).

export type ThemeName = "light" | "dark";

export interface TabConfig {
  // Stable id; also the i18n key suffix (tab.<id>).
  id: "focus" | "tasks" | "notes" | "media";
  enabled: boolean;
}

export interface Settings {
  // schemaVersion travels with the data so Spec 2 can migrate it.
  schemaVersion: 1;
  theme: ThemeName;
  // Chosen monitor by OS name; null means "primary".
  monitorName: string | null;
  // Launch Islet when Windows starts. Off by default (privacy: opt in).
  launchAtStartup: boolean;
  // Tab order + on/off. Order is the array order.
  tabs: TabConfig[];
}

const DEFAULTS: Settings = {
  schemaVersion: 1,
  theme: "dark",
  monitorName: null,
  launchAtStartup: false,
  tabs: [
    { id: "focus", enabled: true },
    { id: "tasks", enabled: true },
    { id: "notes", enabled: true },
    { id: "media", enabled: true },
  ],
};

export const settings = signal<Settings>(structuredClone(DEFAULTS));

/** Merge a partial update into settings. (Spec 2: also persist to disk here.) */
export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
}

/** Replace the tabs array (reorder / toggle). Kept separate for clarity. */
export function setTabs(tabs: TabConfig[]): void {
  settings.value = { ...settings.value, tabs };
}

/** Move a tab up or down in the order. No-op at the ends. */
export function moveTab(id: TabConfig["id"], dir: -1 | 1): void {
  const tabs = [...settings.value.tabs];
  const i = tabs.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= tabs.length) return;
  [tabs[i], tabs[j]] = [tabs[j], tabs[i]];
  setTabs(tabs);
}

/** Toggle a single tab on/off. */
export function toggleTab(id: TabConfig["id"]): void {
  setTabs(
    settings.value.tabs.map((t) =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    )
  );
}

/** Tabs that are enabled, in order. The shell renders these. */
export function enabledTabs(): TabConfig[] {
  return settings.value.tabs.filter((t) => t.enabled);
}

// ---- persistence (Spec 2) ----

// While loading from disk we must not echo the value straight back as a save.
let loaded = false;

/**
 * Load persisted settings once at startup. Safe to call outside Tauri (tests,
 * browser preview): on failure it keeps the in-memory defaults.
 */
export async function initSettings(): Promise<void> {
  try {
    const disk = await loadSettings();
    // Trust the Rust-validated shape; coerce tabs to our union-typed ids.
    settings.value = {
      schemaVersion: 1,
      theme: disk.theme === "light" ? "light" : "dark",
      monitorName: disk.monitorName ?? null,
      launchAtStartup: !!disk.launchAtStartup,
      tabs: disk.tabs
        .filter((t): t is { id: TabConfig["id"]; enabled: boolean } =>
          ["focus", "tasks", "notes", "media"].includes(t.id)
        )
        .map((t) => ({ id: t.id, enabled: !!t.enabled })),
    };
  } catch {
    // Not in Tauri or load failed: keep defaults.
  } finally {
    loaded = true;
  }
}

// Persist on any change after the initial load. Rust debounces the disk write,
// so firing on every change is fine and never exceeds the disk budget.
effect(() => {
  const value = settings.value;
  if (!loaded) return;
  void saveSettings({
    schemaVersion: value.schemaVersion,
    theme: value.theme,
    monitorName: value.monitorName,
    launchAtStartup: value.launchAtStartup,
    tabs: value.tabs.map((t) => ({ id: t.id, enabled: t.enabled })),
  }).catch(() => {
    /* non-fatal: keep working from memory */
  });
});
