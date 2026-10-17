import { t } from "../ui/i18n";
import type { TabId } from "./tabs";
import { enabledTabs } from "./settings-store";

// The tab row shown at the top of the open panel. Keyboard accessible: arrow
// keys move between tabs (roving tabindex), Enter/Space activates.
export function TabBar({
  active,
  onSelect,
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  // Settings is always available and sits last.
  const tabs: TabId[] = [...enabledTabs().map((tb) => tb.id), "settings"];

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
          {t(`tab.${id}`)}
        </button>
      ))}
    </div>
  );
}
