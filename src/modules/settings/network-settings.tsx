import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import {
  netGetConfig,
  netSetAirplaneMode,
  netSetHostEnabled,
  netRemoveHost,
  netGetLedger,
  netClearLedger,
  type NetConfig,
  type Ledger,
} from "../../app/net-bridge";

// The Network & privacy section of Settings (Spec 14). Shows airplane mode, the
// host allow-list, and the egress ledger ("what left this PC"). All network
// decisions live in Rust; this only calls the allow-listed net_* commands.
// Metadata only is ever shown — the ledger never stores headers or bodies.

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function resultLabel(result: string): string {
  switch (result) {
    case "ok":
      return t("net.result.ok");
    case "rejected":
      return t("net.result.rejected");
    default:
      return t("net.result.error");
  }
}

export function NetworkSettings() {
  const [cfg, setCfg] = useState<NetConfig | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [c, l] = await Promise.all([netGetConfig(), netGetLedger()]);
      setCfg(c);
      setLedger(l);
    } catch {
      // Not in Tauri (tests/preview) or load failed: show empty states.
      setCfg({ schemaVersion: 1, airplaneMode: false, hosts: [] });
      setLedger({ schemaVersion: 1, entries: [] });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function toggleAirplane() {
    if (!cfg) return;
    setBusy(true);
    try {
      setCfg(await netSetAirplaneMode(!cfg.airplaneMode));
    } catch {
      /* non-fatal */
    } finally {
      setBusy(false);
    }
  }

  async function toggleHost(host: string, enabled: boolean) {
    setBusy(true);
    try {
      setCfg(await netSetHostEnabled(host, enabled));
    } catch {
      /* non-fatal */
    } finally {
      setBusy(false);
    }
  }

  async function removeHost(host: string) {
    setBusy(true);
    try {
      setCfg(await netRemoveHost(host));
    } catch {
      /* non-fatal */
    } finally {
      setBusy(false);
    }
  }

  async function clearLog() {
    setBusy(true);
    try {
      await netClearLedger();
      setLedger({ schemaVersion: 1, entries: [] });
    } catch {
      /* non-fatal */
    } finally {
      setBusy(false);
    }
  }

  // Loading state until the first fetch resolves.
  if (!cfg || !ledger) {
    return <p class="islet-dim">{t("common.loading")}</p>;
  }

  return (
    <div class="islet-net-settings">
      <p class="islet-dim islet-net-intro">{t("net.intro")}</p>

      <label class="islet-field">
        <span>{t("net.airplane")}</span>
        <button
          class={`islet-toggle${cfg.airplaneMode ? " on" : ""}`}
          role="switch"
          aria-checked={cfg.airplaneMode}
          onClick={toggleAirplane}
          disabled={busy}
        >
          {cfg.airplaneMode ? t("common.on") : t("common.off")}
        </button>
      </label>
      {cfg.airplaneMode ? (
        <p class="islet-net-airplane-note">{t("net.airplaneOn")}</p>
      ) : null}

      <div class="islet-field islet-browse-head">
        <span>{t("net.hostsTitle")}</span>
      </div>
      {cfg.hosts.length === 0 ? (
        <p class="islet-char-empty">{t("net.hostsEmpty")}</p>
      ) : (
        <ul class="islet-net-hosts">
          {cfg.hosts.map((h) => (
            <li key={h.host} class="islet-net-host">
              <span class="islet-net-host-main">
                <span class="islet-net-host-name">{h.host}</span>
                <span class="islet-dim islet-net-host-feature">
                  {t("net.feature")}: {h.feature}
                </span>
              </span>
              <button
                class={`islet-toggle${h.enabled && !cfg.airplaneMode ? " on" : ""}`}
                role="switch"
                aria-checked={h.enabled}
                onClick={() => toggleHost(h.host, !h.enabled)}
                disabled={busy || cfg.airplaneMode}
                title={h.host}
              >
                {h.enabled ? t("common.on") : t("common.off")}
              </button>
              <button
                class="islet-icon-btn"
                aria-label={t("net.remove")}
                title={t("net.remove")}
                onClick={() => removeHost(h.host)}
                disabled={busy}
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div class="islet-field islet-browse-head">
        <span>{t("net.ledgerTitle")}</span>
        {ledger.entries.length > 0 ? (
          <button class="islet-btn" onClick={clearLog} disabled={busy}>
            {t("net.ledgerClear")}
          </button>
        ) : null}
      </div>
      {ledger.entries.length === 0 ? (
        <p class="islet-char-empty">{t("net.ledgerEmpty")}</p>
      ) : (
        <ul class="islet-net-ledger">
          {ledger.entries.map((e, i) => (
            <li key={`${e.time}-${i}`} class={`islet-net-row result-${e.result}`}>
              <span class="islet-net-row-top">
                <span class="islet-net-host-name">{e.host || "—"}</span>
                <span class={`islet-net-result result-${e.result}`}>
                  {resultLabel(e.result)}
                </span>
              </span>
              <span class="islet-dim islet-net-row-meta">
                {e.time} · {e.feature} · {e.method} ·{" "}
                {t("net.bytes", {
                  out: fmtBytes(e.bytesOut),
                  in: fmtBytes(e.bytesIn),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
