import { computed } from "@preact/signals";
import { settings } from "./settings-store";

// Pill style glue (Spec 11). Derives the current style + which status items are
// shown from settings. The shell reads `pillStyle` to choose Notch vs the
// status-bar strip. Defaults keep Notch as the style.

export type StatusItemId =
  | "launcher"
  | "quick"
  | "sound"
  | "battery"
  | "clock"
  | "notifications"
  | "collapse";

/** Default order of status-bar items (Spec 11 Requirement 1.1). */
export const DEFAULT_STATUS_ITEMS: StatusItemId[] = [
  "launcher",
  "quick",
  "sound",
  "battery",
  "clock",
  "notifications",
  "collapse",
];

export const pillStyle = computed(() => settings.value.pillStyle);

/** The ordered, enabled status items. Empty setting = all defaults. */
export const statusItems = computed<StatusItemId[]>(() => {
  const saved = settings.value.statusItems;
  if (!saved || saved.length === 0) return DEFAULT_STATUS_ITEMS;
  return saved.filter((id): id is StatusItemId =>
    (DEFAULT_STATUS_ITEMS as string[]).includes(id)
  );
});
