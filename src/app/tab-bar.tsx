import { useEffect, useState } from "preact/hooks";
import { t } from "../ui/i18n";
import type { TabId } from "./tabs";
import { SYSTEM_TABS } from "./tabs";
import { enabledTabs } from "./settings-store";
import { Icon, type IconName } from "../ui/controls/icon";

// Short labels for the System group tabs (Spec 11).
const SYSTEM_LABEL: Record<string, string> = {
  "sys-clock": "tab.clock",
  "sys-sound": "tab.sound",
  "sys-power": "tab.battery",
  "sys-quick": "tab.quick",
  "sys-notifications": "tab.notifications",
};

// One glyph per tab. Icon-first navigation is deliberate: the previous bar put
// 12 text labels in a 348px panel with `flex-wrap`, so the panel header
// collapsed into a stacked list of words instead of reading as a tab strip.
const TAB_ICON: Record<string, IconName> = {
  focus: "timer",
  tasks: "checklist",
  notes: "note",
  media: "music",
  launcher: "grid",
  progress: "chart",
  settings: "gear",
  "sys-clock": "calendar",
  "sys-sound": "speaker",
  "sys-power": "battery",
  "sys-quick": "wifi",
  "sys-notifications": "bell",
};

const SYSTEM_SET = new Set<string>(SYSTEM_TABS);

/**
 * The panel's navigation. A single row of icon tabs: the enabled feature tabs,
 * then one "System" entry that stands in for the five system flyouts, then
 * Settings. Selecting System reveals its members on a second row, so the whole
 * tree stays reachable (AGENTS.md requires each system flyout to be reachable
 * as a tab) without ever wrapping the primary row.
 *
 * Keyboard: arrow keys move within a row (roving tabindex), Enter/Space
 * activates, matching the tablist pattern.
 */
export function TabBar({
  active,
  onSelect,
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  const features: TabId[] = enabledTabs().map((tb) => tb.id);
  const systemActive = SYSTEM_SET.has(active);

  // Keep the System group expanded while one of its members is showing.
  const [systemOpen, setSystemOpen] = useState(systemActive);
  useEffect(() => {
    if (systemActive) setSystemOpen(true);
  }, [systemActive]);

  // The primary row. "system" is a group handle, not a tab id of its own.
  const primary: (TabId | "system")[] = [...features, "system", "settings"];

  function labelFor(id: TabId): string {
    return SYSTEM_LABEL[id] ? t(SYSTEM_LABEL[id]) : t(`tab.${id}`);
  }

  function move(row: (TabId | "system")[], index: number, dir: number) {
    const next = row[(index + dir + row.length) % row.length];
    if (next === "system") {
      setSystemOpen(true);
      onSelect(SYSTEM_TABS[0]);
    } else {
      onSelect(next);
    }
  }

  function onKey(
    e: KeyboardEvent,
    row: (TabId | "system")[],
    index: number
  ) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    move(row, index, e.key === "ArrowRight" ? 1 : -1);
  }

  return (
    <div class="islet-nav">
      <div class="islet-tabbar" role="tablist" aria-label={t("tab.nav")}>
        {primary.map((id, i) => {
          if (id === "system") {
            // Group handle: reflects "a system tab is showing", and opening it
            // lands on the first member so the row never dead-ends.
            return (
              <button
                key="system"
                type="button"
                aria-expanded={systemOpen}
                class={`islet-tab${systemActive ? " active" : ""}`}
                title={t("tab.system")}
                aria-label={t("tab.system")}
                onClick={() => {
                  setSystemOpen(true);
                  if (!systemActive) onSelect(SYSTEM_TABS[0]);
                }}
                onKeyDown={(e) => onKey(e, primary, i)}
              >
                <Icon name="sliders" size={18} />
              </button>
            );
          }
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === active}
              tabIndex={id === active ? 0 : -1}
              class={`islet-tab${id === active ? " active" : ""}`}
              title={labelFor(id)}
              aria-label={labelFor(id)}
              onClick={() => onSelect(id)}
              onKeyDown={(e) => onKey(e, primary, i)}
            >
              <Icon name={TAB_ICON[id] ?? "sliders"} size={18} />
            </button>
          );
        })}
      </div>

      {/* Second row: the System group's members, shown only while the group is
          open. Labelled, because these five glyphs are far less familiar than
          the feature set. */}
      {systemOpen ? (
        <div
          class="islet-tabbar sub"
          role="tablist"
          aria-label={t("tab.system")}
        >
          {SYSTEM_TABS.map((id, i) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === active}
              tabIndex={id === active ? 0 : -1}
              class={`islet-subtab${id === active ? " active" : ""}`}
              onClick={() => onSelect(id)}
              onKeyDown={(e) => onKey(e, SYSTEM_TABS as TabId[], i)}
            >
              <Icon name={TAB_ICON[id] ?? "sliders"} size={15} />
              <span>{labelFor(id)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
