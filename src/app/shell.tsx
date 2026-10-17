import { useEffect, useRef, useState } from "preact/hooks";
import { listen } from "@tauri-apps/api/event";
import { APP_NAME } from "../app.config";
import { t } from "../ui/i18n";
import {
  openPanel,
  closePanel,
  startNotchDrag,
  getNotchOffset,
  setNotchFreePosition,
} from "./window-bridge";
import { settings, updateSettings } from "./settings-store";
import { pendingPermissions } from "./permission-store";
import { PermissionPrompt } from "./permission-prompt";
import { TabBar } from "./tab-bar";
import { LazyPanel } from "./lazy-panel";
import type { TabId } from "./tabs";
import { CharacterCanvas } from "../characters/renderer";
import {
  activeCharacter,
  activeRecord,
  characterProblem,
  initCharacterGate,
  loadActiveCharacter,
} from "../characters/character-store";
import {
  characterSignals,
  initCharacterSignals,
} from "../characters/signals-store";
import { characterSetActive } from "../characters/bridge";

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

  const character = activeCharacter.value;
  const showInNotch = activeRecord.value.showInNotch;
  const charProblem = characterProblem.value;

  // Bring the character system up once: wire the animate/stop gate, the focus
  // signals, and load the active (default) character.
  useEffect(() => {
    initCharacterGate();
    initCharacterSignals();
    void loadActiveCharacter();
  }, []);

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
    // A drag just happened: swallow the click so it does not toggle the panel.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setPinned((p) => !p || !open);
    setOpen(true);
  }

  // On-notch quick toggle for showing the character in the closed pill. Writes
  // through the backend, then refreshes the active-character store so the notch
  // updates live. The persisted active record is the source of truth.
  function toggleCharacterInNotch() {
    const next = !activeRecord.value.showInNotch;
    void characterSetActive(activeRecord.value.id, next)
      .then(() => loadActiveCharacter())
      .catch(() => {});
  }

  // ---- Place anywhere: drag the notch, persist where it lands ----
  const draggedRef = useRef(false);

  function handleDragStart(e: PointerEvent) {
    // Left button only; never start a drag from the character canvas itself.
    if (e.button !== 0) return;
    e.stopPropagation();
    draggedRef.current = true;
    void startNotchDrag().catch(() => {
      draggedRef.current = false;
    });
  }

  // When a native drag ends (pointerup anywhere), read + persist the new spot.
  useEffect(() => {
    function onUp() {
      if (!draggedRef.current) return;
      void getNotchOffset()
        .then(([x, y]) => {
          updateSettings({ notchFree: { x, y } });
          return setNotchFreePosition(x, y);
        })
        .catch(() => {})
        // Keep draggedRef true briefly so the trailing click is swallowed, then
        // clear it on the next tick.
        .finally(() => {
          setTimeout(() => {
            draggedRef.current = false;
          }, 0);
        });
    }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, []);

  const hasAlert = pending.length > 0;

  return (
    <div class="islet-stack" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <div
        class={`islet-pill${open ? " open" : ""}${hasAlert ? " has-alert" : ""}${
          character && showInNotch && !open ? " has-character" : ""
        }`}
        onClick={handlePillClick}
        title={`${APP_NAME} · ${t("app.tagline")}`}
      >
        {hasAlert && !open ? <span class="islet-alert-dot" /> : null}
        {/* Living notch: the character draws inside the closed pill at a low
            rate. Hidden while open (the panel shows the full-size character). */}
        {character && showInNotch && !open ? (
          <CharacterCanvas
            surface="notch"
            signals={characterSignals(true)}
            class="islet-notch-canvas"
          />
        ) : null}
        {/* Drag grip (place-anywhere). Appears on hover; a pointer-down here
            starts a native window drag instead of toggling the panel. */}
        <span
          class="islet-notch-grip"
          title={t("notch.drag")}
          aria-label={t("notch.drag")}
          onPointerDown={handleDragStart}
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </span>
      </div>

      {hasAlert ? <PermissionPrompt /> : null}

      {open ? (
        <div class="islet-panel" role="dialog" aria-label={APP_NAME}>
          {character ? (
            <div class="islet-panel-character">
              <CharacterCanvas
                surface="panel"
                signals={characterSignals(false)}
                class="islet-panel-canvas"
              />
              <div class="islet-panel-character-row">
                <span class="islet-panel-character-name">
                  {character.manifest.name}
                </span>
                {/* On-notch quick control: toggle whether the character shows
                    in the closed pill, without opening Settings. */}
                <button
                  class={`islet-toggle small${showInNotch ? " on" : ""}`}
                  role="switch"
                  aria-checked={showInNotch}
                  title={t("settings.character.inNotch")}
                  onClick={() => toggleCharacterInNotch()}
                >
                  {t("settings.character.inNotch")}
                </button>
              </div>
            </div>
          ) : null}
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
            {!character && charProblem === "character-unavailable" ? (
              <div class="islet-notice" role="status">
                <span>{t("character.unavailable")}</span>
              </div>
            ) : null}
            <LazyPanel id={active} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
