import type { ComponentType } from "preact";
import type { TabConfig } from "./settings-store";

// Tab registry. Each tab's panel is loaded only when the tab is first opened
// (dynamic import) so closed/unused features cost nothing (lazy-loading rule).
// Real feature panels arrive in later specs; for Spec 1 they are empty shells.

export type TabId = TabConfig["id"] | "settings";

type Loader = () => Promise<{ default: ComponentType }>;

export const TAB_LOADERS: Record<TabId, Loader> = {
  focus: () => import("../modules/focus/panel"),
  tasks: () => import("../modules/tasks/panel"),
  notes: () => import("../modules/notes/panel"),
  media: () => import("../modules/media/panel"),
  launcher: () => import("../modules/launcher/panel"),
  progress: () => import("../modules/progress/panel"),
  settings: () => import("../modules/settings/panel"),
};
