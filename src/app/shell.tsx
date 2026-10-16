import { useEffect, useState } from "preact/hooks";
import { listen } from "@tauri-apps/api/event";
import { APP_NAME } from "../app.config";
import {
  openPanel,
  closePanel,
  getSpikeReport,
  type SpikeReport,
} from "./window-bridge";
import {
  pendingPermissions,
  requestPermission,
} from "./permission-store";
import { PermissionPrompt } from "./permission-prompt";

/**
 * Spec 0 spike shell.
 * - Pill at top-center (window itself is positioned by Rust).
 * - Hover opens the panel, mouse-leave closes it. Rust flips click-through so
 *   the closed pill never eats clicks and never steals focus.
 * - Shows the live spike report so we can eyeball monitor / DPI / fullscreen.
 * - Hosts the on-notch permission prompt surface.
 */
export function Shell() {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<SpikeReport | null>(null);
  const pending = pendingPermissions.value;

  // Refresh the spike report whenever the panel opens so numbers are current.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    getSpikeReport()
      .then((r) => alive && setReport(r))
      .catch(() => {
        /* spike: surface errors as empty state rather than crashing */
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // Rust tells us when a fullscreen app appears so the panel can auto-close.
  // Event-driven, not polling (AGENTS.md hard rule #2).
  useEffect(() => {
    const unlisten = listen("islet://fullscreen-changed", (e) => {
      if (e.payload === true) {
        setOpen(false);
        void closePanel();
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // Spike demo: queue a sample permission request once, so the notch surface
  // is exercised. Real triggers come from each feature in later specs.
  useEffect(() => {
    requestPermission({
      id: "demo-notifications",
      capability: "notifications",
      title: "Allow notifications?",
      body: `${APP_NAME} can tell you when a focus round ends. You can change this later in Settings.`,
    });
  }, []);

  function handleEnter() {
    setOpen(true);
    void openPanel();
  }

  function handleLeave() {
    // Keep the panel open while a permission is pending so it is not missed.
    if (pending.length > 0) return;
    setOpen(false);
    void closePanel();
  }

  const hasAlert = pending.length > 0;

  return (
    <div class="islet-stack" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <div class={`islet-pill${open ? " open" : ""}${hasAlert ? " has-alert" : ""}`}>
        {hasAlert && !open ? <span class="islet-alert-dot" /> : null}
      </div>

      {hasAlert ? <PermissionPrompt /> : null}

      {open ? (
        <div class="islet-panel">
          <h1>{APP_NAME} · spike</h1>
          {report ? (
            <>
              <div class="islet-row">
                <span>Monitors</span>
                <b>{report.monitorCount}</b>
              </div>
              <div class="islet-row">
                <span>Active monitor</span>
                <b>{report.activeMonitorName || "unknown"}</b>
              </div>
              <div class="islet-row">
                <span>DPI scale</span>
                <b>{report.scaleFactor.toFixed(2)}x</b>
              </div>
              <div class="islet-row">
                <span>Work area</span>
                <b>
                  {report.workAreaWidth}×{report.workAreaHeight}
                </b>
              </div>
              <div class="islet-row">
                <span>Fullscreen app</span>
                <b>{report.fullscreenAppActive ? "yes" : "no"}</b>
              </div>
            </>
          ) : (
            <div class="islet-row">
              <span>Loading spike report…</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
