import { signal } from "@preact/signals";

// In-memory settings for Spec 1. This is the SEAM for Spec 2: the shape and the
// `settings` signal + `updateSettings()` API stay the same; only the backing
// (currently memory) gets swapped for versioned JSON on disk with atomic
// writes and migrations. Callers must not reach around this module.

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
