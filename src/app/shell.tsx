import { useEffect, useState } from "preact/hooks";
import { listen } from "@tauri-apps/api/event";
import { APP_NAME } from "../app.config";
import { t } from "../ui/i18n";
import { openPanel, closePanel } from "./window-bridge";
import { settings } from "./settings-store";
import { pendingPermissions } from "./permission-store";
import { PermissionPrompt } from "./permission-prompt";
import { TabBar } from "./tab-bar";
import { LazyPanel } from "./lazy-panel";
import type { TabId } from "./tabs";

/**
 * Spec 1 shell.
 * - Closed = pill. Hover opens a preview; click pins it open.
 * - Esc or click-away closes (unless pinned stays until toggled again).
 * - Tray / hotkey toggle via backend events.
 * - Closed means asleep: when closed we render only the pill (no tab code,
 *   no panel work). Panels are lazy-loaded only once a tab is opened.
 */
export function Shell() {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [active, setActive] = useState<TabId>("focus");
  const [hotkeyMsg, setHotkeyMsg] = useState<string | null>(null);
  const pending = pendingPermissions.value;
  const theme = settings.value.theme;

  // Apply the theme to <html> so the design tokens switch.
  useEffect(() => {
    document.documentElement.classList.toggle("theme-light", theme === "light");
  }, [theme]);

  // Apply the user's notch transparency as a CSS variable the pill reads.
  const notchOpacity = settings.value.notchOpacity;
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--islet-pill-opacity",
      String(notchOpacity)
    );
  }, [notchOpacity]);

  // Backend-driven toggle (tray icon, global hotkey). Payload = new open state.
  useEffect(() => {
    const un = listen<boolean>("islet://toggle-open", (e) => {
      const next = e.payload;
      setOpen(next);
      setPinned(next); // a deliberate toggle pins/unpins
    });
    return () => void un.then((f) => f());
  }, []);

  // Tray "Settings" opens the panel on the Settings tab.
  useEffect(() => {
    const un = listen("islet://open-settings", () => {
      setActive("settings");
      setOpen(true);
      setPinned(true);
    });
    return () => void un.then((f) => f());
  }, []);

  // Hotkey conflict: show a friendly, dismissible message (no crash).
  useEffect(() => {
    const un = listen<string>("islet://hotkey-conflict", (e) => {
      setHotkeyMsg(t("hotkey.conflict", { combo: e.payload }));
    });
    return () => void un.then((f) => f());
  }, []);

  // Fullscreen app appeared: hide the panel (event-driven, not polling).
  useEffect(() => {
    const un = listen<boolean>("islet://fullscreen-changed", (e) => {
      if (e.payload === true) {
        setOpen(false);
        setPinned(false);
      }
    });
    return () => void un.then((f) => f());
  }, []);

  // Esc closes the panel (unless a permission is pending).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && pending.length === 0) {
        setOpen(false);
        setPinned(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending.length]);

  // Keep the OS window footprint in sync with open/closed (size + focus).
  useEffect(() => {
    if (open) void openPanel();
    else void closePanel();
  }, [open]);

  function handleEnter() {
    if (!open) setOpen(true);
  }

  function handleLeave() {
    // Pinned or a pending permission keeps it open; otherwise close.
    if (pinned || pending.length > 0) return;
    setOpen(false);
  }

  function handlePillClick() {
    setPinned((p) => !p || !open);
    setOpen(true);
  }

  const hasAlert = pending.length > 0;

  return (
    <div class="islet-stack" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <div
        class={`islet-pill${open ? " open" : ""}${hasAlert ? " has-alert" : ""}`}
        onClick={handlePillClick}
        title={`${APP_NAME} · ${t("app.tagline")}`}
      >
        {hasAlert && !open ? <span class="islet-alert-dot" /> : null}
      </div>

      {hasAlert ? <PermissionPrompt /> : null}

      {open ? (
        <div class="islet-panel" role="dialog" aria-label={APP_NAME}>
          <TabBar active={active} onSelect={setActive} />
          <div class="islet-panel-body">
            {hotkeyMsg ? (
              <div class="islet-notice" role="status">
                <span>{hotkeyMsg}</span>
                <button class="islet-btn" onClick={() => setHotkeyMsg(null)}>
                  OK
                </button>
              </div>
            ) : null}
            <LazyPanel id={active} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
