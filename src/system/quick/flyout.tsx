import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Tile, TileMini } from "../../ui/controls/tile";
import { FlyoutSection } from "../flyout-shell";
import SoundFlyout from "../sound/flyout";
import PowerFlyout from "../power/flyout";
import {
  radiosGet,
  radiosRequestAccess,
  radiosSet,
  openMsSettings,
  type RadioState,
} from "../bridge";

// Quick settings flyout (Spec 11). Wi-Fi/Bluetooth tiles (real read-back),
// DND link, conditional action tiles, and the embedded Sound + Power cards.
// Night light is intentionally not built (no public API). Unsupported tiles are
// dropped, never shown as dead switches.
export default function QuickFlyout() {
  const [radios, setRadios] = useState<RadioState | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setRadios(await radiosGet().catch(() => null));
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function toggle(kind: "wifi" | "bluetooth", on: boolean) {
    setBusy(true);
    try {
      // Ensure access once; hardware/policy may still override (we re-read).
      await radiosRequestAccess().catch(() => false);
      const next = await radiosSet(kind, on).catch(() => null);
      if (next) setRadios(next);
      else await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="islet-quick">
      <div class="islet-quick-grid">
        {radios?.wifiSupported ? (
          <Tile
            icon="wifi"
            title={t("quick.wifi")}
            sub={radios.wifiOn ? t("quick.connected") : t("common.off")}
            on={radios.wifiOn}
            disabled={busy}
            onClick={() => toggle("wifi", !radios.wifiOn)}
          />
        ) : null}
        {radios?.btSupported ? (
          <Tile
            icon="bluetooth"
            title={t("quick.bluetooth")}
            sub={radios.btOn ? t("common.on") : t("common.off")}
            on={radios.btOn}
            disabled={busy}
            onClick={() => toggle("bluetooth", !radios.btOn)}
          />
        ) : null}
        <Tile
          icon="moon"
          title={t("quick.dnd")}
          sub={t("quick.viaSettings")}
          onClick={() => void openMsSettings("notifications").catch(() => {})}
        />
      </div>

      {/* Action tiles: only those with a verified settings link (Night light
          and others without a link are dropped, not faked). */}
      <div class="islet-quick-mini">
        <TileMini icon="project" title={t("quick.project")} onClick={() => void openMsSettings("project").catch(() => {})} />
        <TileMini icon="accessibility" title={t("quick.accessibility")} onClick={() => void openMsSettings("accessibility").catch(() => {})} />
      </div>

      {/* Embedded shared cards (one implementation, reused). */}
      <SoundFlyout />
      <PowerFlyout />

      <FlyoutSection>
        <button class="islet-btn islet-quick-more" onClick={() => void openMsSettings("notifications").catch(() => {})}>
          {t("quick.more")}
        </button>
      </FlyoutSection>
    </div>
  );
}
