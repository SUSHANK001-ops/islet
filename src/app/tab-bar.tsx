import { t } from "../ui/i18n";
import type { TabId } from "./tabs";
import { SYSTEM_TABS } from "./tabs";
import { enabledTabs } from "./settings-store";

// Short labels for the System group tabs (Spec 11).
const SYSTEM_LABEL: Record<string, string> = {
  "sys-clock": "tab.clock",
  "sys-sound": "tab.sound",
  "sys-power": "tab.battery",
  "sys-quick": "tab.quick",
  "sys-notifications": "tab.notifications",
};

// The tab row shown at the top of the open panel. Keyboard accessible: arrow
// keys move between tabs (roving tabindex), Enter/Space activates.
export function TabBar({
  active,
  onSelect,
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  // Feature tabs, then the System group, then Settings last.
  const tabs: TabId[] = [
    ...enabledTabs().map((tb) => tb.id),
    ...SYSTEM_TABS,
    "settings",
  ];

  function labelFor(id: TabId): string {
    return SYSTEM_LABEL[id] ? t(SYSTEM_LABEL[id]) : t(`tab.${id}`);
  }

  function onKey(e: KeyboardEvent, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = (index + dir + tabs.length) % tabs.length;
      onSelect(tabs[next]);
    }
  }

  return (
    <div class="islet-tabbar" role="tablist" aria-label="Islet tabs">
      {tabs.map((id, i) => (
        <button
          key={id}
          role="tab"
          aria-selected={id === active}
          tabIndex={id === active ? 0 : -1}
          class={`islet-tab${id === active ? " active" : ""}`}
          onClick={() => onSelect(id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {labelFor(id)}
        </button>
      ))}
    </div>
  );
}
