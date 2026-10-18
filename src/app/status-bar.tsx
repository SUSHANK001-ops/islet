import { useEffect, useState } from "preact/hooks";
import { Icon, type IconName } from "../ui/controls/icon";
import { statusItems, type StatusItemId } from "./pill-style";
import { settings } from "./settings-store";
import { t } from "../ui/i18n";
import { CharacterCanvas } from "../characters/renderer";
import { activeCharacter, activeRecord } from "../characters/character-store";
import { characterSignals } from "../characters/signals-store";

// The status-bar pill (Spec 11). A compact strip of live system items on the
// closed pill. Each item opens its flyout (wired in Task 3 via `onOpen`). The
// clock updates only on minute boundaries using ONE self-rescheduling timeout
// (not a poll, not a per-second tick) while mounted.
//
// Design §6 layout: wing | chvL | quick | sound | battery | clock | bell | chvR

/** Which flyout an item opens (collapse/launcher/wing are handled by the shell). */
export type FlyoutKey = "quick" | "sound" | "battery" | "clock" | "notifications";

const ITEM_ICON: Record<Exclude<StatusItemId, "clock">, IconName> = {
  launcher: "chevron-left",
  quick: "sliders",
  sound: "speaker",
  battery: "battery",
  notifications: "bell",
  collapse: "chevron-down",
};

function formatClock(d: Date): string {
  // Follows the OS locale (regional settings). Short weekday + day + time.
  try {
    const date = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${date}  ${time}`;
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function StatusBar({
  onOpen,
  onLauncher,
  onCollapse,
  hasBattery,
  unread,
}: {
  onOpen: (key: FlyoutKey, anchor: HTMLElement) => void;
  onLauncher: (anchor: HTMLElement) => void;
  onCollapse: () => void;
  hasBattery: boolean;
  unread: number;
}) {
  const items = statusItems.value;
  const [now, setNow] = useState(() => new Date());
  const character = activeCharacter.value;
  const showWing = character && activeRecord.value.showInNotch;

  // Minute-aligned clock: schedule one timeout to the next minute boundary,
  // then reschedule. One timer, only while the status bar is mounted.
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    function tickToNextMinute() {
      const d = new Date();
      setNow(d);
      const msToNextMinute = 60000 - (d.getSeconds() * 1000 + d.getMilliseconds());
      id = setTimeout(tickToNextMinute, msToNextMinute + 20);
    }
    tickToNextMinute();
    return () => clearTimeout(id);
  }, []);

  function renderItem(id: StatusItemId) {
    // Battery item hidden when the PC has no battery (Requirement 1.2).
    if (id === "battery" && !hasBattery) return null;

    if (id === "clock") {
      return (
        <button
          key="clock"
          class="islet-sb-clock islet-num"
          onClick={(e) => onOpen("clock", e.currentTarget)}
          title={t("tab.clock")}
        >
          {formatClock(now)}
        </button>
      );
    }
    if (id === "launcher") {
      return (
        <button
          key="launcher"
          class="islet-sb-item"
          aria-label={t("tab.launcher")}
          onClick={(e) => onLauncher(e.currentTarget)}
        >
          <Icon name="chevron-left" size={18} />
        </button>
      );
    }
    if (id === "collapse") {
      return (
        <button
          key="collapse"
          class="islet-sb-item"
          aria-label={t("notch.collapse")}
          onClick={onCollapse}
        >
          <Icon name="chevron-down" size={18} />
        </button>
      );
    }

    const flyout = id as FlyoutKey;
    const isBell = id === "notifications";
    return (
      <button
        key={id}
        class="islet-sb-item"
        aria-label={t(`tab.${id}`)}
        onClick={(e) => onOpen(flyout, e.currentTarget)}
      >
        <Icon name={ITEM_ICON[id]} size={18} />
        {isBell && unread > 0 ? <span class="islet-sb-dot" aria-hidden="true" /> : null}
      </button>
    );
  }

  return (
    <div
      class="islet-statusbar"
      role="toolbar"
      aria-label="Islet status bar"
      style={{ "--islet-pill-opacity": String(settings.value.notchOpacity) }}
    >
      {/* Character wing: the active character in its own left slot (design §6).
          Shares the one decoded bitmap + low-rate notch loop with the panel. */}
      {showWing ? (
        <span class="islet-sb-wing" aria-hidden="true">
          <CharacterCanvas
            surface="notch"
            signals={characterSignals(true)}
            class="islet-sb-wing-canvas"
          />
        </span>
      ) : null}
      {items.map(renderItem)}
    </div>
  );
}
