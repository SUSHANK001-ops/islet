import type { ComponentType } from "preact";
import type { TabConfig } from "./settings-store";

// Tab registry. Each tab's panel is loaded only when the tab is first opened
// (dynamic import) so closed/unused features cost nothing (lazy-loading rule).

// Spec 11 adds a "System" group: the same shared flyout components mounted as
// tabs (rendered without the pill chip).
export type SystemTabId =
  | "sys-clock"
  | "sys-sound"
  | "sys-power"
  | "sys-quick"
  | "sys-notifications";

export type TabId = TabConfig["id"] | "settings" | SystemTabId;

type Loader = () => Promise<{ default: ComponentType }>;

export const SYSTEM_TABS: SystemTabId[] = [
  "sys-clock",
  "sys-sound",
  "sys-power",
  "sys-quick",
  "sys-notifications",
];

export const TAB_LOADERS: Record<TabId, Loader> = {
  focus: () => import("../modules/focus/panel"),
  tasks: () => import("../modules/tasks/panel"),
  notes: () => import("../modules/notes/panel"),
  media: () => import("../modules/media/panel"),
  launcher: () => import("../modules/launcher/panel"),
  progress: () => import("../modules/progress/panel"),
  settings: () => import("../modules/settings/panel"),
  "sys-clock": () => import("../system/clock/flyout"),
  "sys-sound": () => import("../system/sound/flyout"),
  "sys-power": () => import("../system/power/flyout"),
  "sys-quick": () => import("../system/quick/flyout"),
  "sys-notifications": () => import("../system/notifications/flyout"),
};
