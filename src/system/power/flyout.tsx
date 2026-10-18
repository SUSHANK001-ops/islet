import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import { Segmented } from "../../ui/controls/segmented";
import { FlyoutSection } from "../flyout-shell";
import { powerGet, powerSetOverlay, openMsSettings, type PowerState } from "../bridge";

// Battery & power-mode flyout (Spec 11). Battery card + overlay-scheme segmented
// control that reflects the real read-back. If overlay is unsupported, the
// control is replaced by an "Open Windows settings" action (never a dead one).
export default function PowerFlyout() {
  const [state, setState] = useState<PowerState | null>(null);

  useEffect(() => {
    let alive = true;
    powerGet()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, []);

  if (!state) return <div class="islet-empty">{t("common.loading")}</div>;

  async function setOverlay(v: "efficiency" | "balanced" | "performance") {
    const next = await powerSetOverlay(v).catch(() => null);
    if (next) setState(next);
  }

  const segments = [
    { value: "efficiency" as const, label: t("power.efficiency") },
    { value: "balanced" as const, label: t("power.balanced") },
    { value: "performance" as const, label: t("power.performance") },
  ];
  const overlay = (state.overlay === "unknown" ? "balanced" : state.overlay) as
    | "efficiency"
    | "balanced"
    | "performance";

  return (
    <div class="islet-power">
      {state.hasBattery ? (
        <div class="islet-card islet-card-row">
          <span class="islet-batt-badge" aria-hidden="true">
            <Icon name="battery" size={22} />
          </span>
          <span class="islet-batt-text">
            <span class="islet-batt-pct islet-num">{state.percent}%</span>
            <span class="islet-dim">
              {state.charging ? t("power.charging") : t("power.onBattery")}
            </span>
          </span>
        </div>
      ) : null}

      <FlyoutSection title={t("power.title")}>
        <button
          class="islet-card islet-card-row islet-plan-row"
          onClick={() => void openMsSettings("power").catch(() => {})}
        >
          <span>{t("power.plan")}</span>
          <Icon name="chevron-right" size={16} />
        </button>

        {state.overlaySupported ? (
          <Segmented
            segments={segments}
            value={overlay}
            label={t("power.title")}
            onSelect={setOverlay}
          />
        ) : (
          <button
            class="islet-btn"
            onClick={() => void openMsSettings("power").catch(() => {})}
          >
            {t("power.openSettings")}
          </button>
        )}
      </FlyoutSection>
    </div>
  );
}
