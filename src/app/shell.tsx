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
  setTaskbarProgress,
} from "./window-bridge";
import { settings, updateSettings } from "./settings-store";
import { publishHitRegions, watchHitRegions } from "./hit-regions";
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
  refreshFocusTotal,
} from "../characters/character-store";
import {
  characterSignals,
  initCharacterSignals,
} from "../characters/signals-store";
import { characterSetActive } from "../characters/bridge";
import { StatusBar } from "./status-bar";
import { pillStyle } from "./pill-style";
import { SystemFlyouts, useFlyoutController } from "../system/flyouts-host";
import { Toast } from "../system/notifications/toast";
import { notifications } from "../system/notifications/store";
import { Handle } from "./handle";

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

  // Visibility remains user-controlled, but the safe native hit region means
  // a collapsed notch no longer leaves an invisible click-blocking window.
  const visibility = settings.value.pillVisibility;
  const [collapsed, setCollapsed] = useState(
    settings.value.pillVisibility !== "always"
  );
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusRunning, setFocusRunning] = useState(false);

  // Bring the character system up once: wire the animate/stop gate, the focus
  // signals, and load the active (default) character.
  useEffect(() => {
    initCharacterGate();
    initCharacterSignals();
    void loadActiveCharacter();
    // Lifetime focus minutes decide the growth stage, so read them before the
    // first render of the character rather than waiting for a round to finish.
    void refreshFocusTotal();
  }, []);

  // Drive the taskbar progress from the focus timer. The shell is always
  // mounted (even while closed), so this keeps the taskbar in sync while a
  // round runs in the background. Idle/complete clears it. See
  // platform/taskbar.rs for the skipTaskbar visibility caveat.
  useEffect(() => {
    const un = listen<{
      phase: string;
      runState: string;
      remainingSecs: number;
      totalSecs: number;
    }>("islet://focus-state", (e) => {
      const s = e.payload;
      setFocusRunning(s.phase !== "idle" && s.runState === "running");
      if (s.phase === "idle" || s.totalSecs <= 0) {
        void setTaskbarProgress("none", 0).catch(() => {});
        return;
      }
      const frac = 1 - s.remainingSecs / s.totalSecs;
      const state = s.runState === "paused" ? "paused" : "normal";
      void setTaskbarProgress(state, frac).catch(() => {});
    });
    return () => void un.then((f) => f());
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
      if (next) setCollapsed(false);
      setOpen(next);
      setPinned(next);
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
  //
  // The backend now emits this unconditionally, because a fullscreen app is a
  // hard stop for character animation regardless of settings. Hiding the PANEL
  // is the game-mode behaviour, so that part stays behind the setting.
  useEffect(() => {
    const un = listen<boolean>("islet://fullscreen-changed", (e) => {
      if (e.payload === true && settings.value.gameMode) {
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

  useEffect(() => {
    if (!open) setCollapsed(visibility !== "always");
  }, [visibility]);

  function expandFromHandle() {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    setCollapsed(false);
  }

  function scheduleCollapse() {
    if (visibility === "always" || open || pinned || pending.length > 0) return;
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(
      () => setCollapsed(true),
      visibility === "hidden" ? 0 : settings.value.autohideDelayMs
    );
  }

  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEnter() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    // Hover opening is opt-in. The old unconditional behavior repeatedly
    // mounted and unmounted the panel while crossing the screen edge, causing
    // visual flicker and needless native hit-region churn.
    if (!open && !statusBarStyle && settings.value.openOnHover) {
      setOpen(true);
    }
  }

  function handleLeave() {
    if (statusBarStyle) {
      scheduleCollapse();
      return;
    }
    if (pinned || pending.length > 0) return;

    if (open && settings.value.openOnHover) {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      leaveTimer.current = setTimeout(() => {
        setOpen(false);
        if (visibility !== "always") {
          collapseTimer.current = setTimeout(
            () => setCollapsed(true),
            visibility === "hidden" ? 0 : settings.value.autohideDelayMs
          );
        }
      }, 220);
      return;
    }
    scheduleCollapse();
  }

  function handlePillClick() {
    // A drag just happened: swallow the click so it does not toggle the panel.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    // Click toggles the PIN. If currently pinned open, unpin AND close.
    if (pinned) {
      setPinned(false);
      setOpen(false);
    } else {
      setPinned(true);
      setOpen(true);
    }
  }

  function toggleCharacterInNotch() {
    const next = !activeRecord.value.showInNotch;
    void characterSetActive(activeRecord.value.id, next)
      .then(() => loadActiveCharacter())
      .catch(() => {});
  }

  // System flyouts opened from the status-bar items (Spec 11).
  const flyoutCtrl = useFlyoutController();

  // Keep the OS window shaped to whatever is actually visible, so the empty
  // transparent area stops swallowing clicks meant for the apps behind it.
  const stackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = stackRef.current;
    if (!root) return;
    return watchHitRegions(root);
  }, []);

  // Re-measure whenever a surface appears, disappears or changes size for a
  // reason the observers cannot see (open/collapse/style/character/tab swaps).
  useEffect(() => {
    publishHitRegions();
  }, [open, collapsed, pillStyle.value, character, showInNotch, active, pending.length]);

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
  const statusBarStyle = pillStyle.value === "statusBar";
  const handleDot =
    notifications.value.some((n) => !n.read) || focusRunning;

  return (
    <div
      class={`islet-stack${open ? " open" : ""}`}
      ref={stackRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {collapsed && !open ? (
        <Handle dot={handleDot} onEnter={expandFromHandle} />
      ) : statusBarStyle && !open ? (
        // Status-bar style: a strip of live system items on the closed pill.
        // Items open their flyout via the controller (wired fully in Task 3).
        <StatusBar
          onOpen={(key, anchor) => flyoutCtrl.openAt(key, anchor)}
          onLauncher={() => {
            setActive("launcher");
            setOpen(true);
            setPinned(true);
          }}
          onCollapse={() => {
            setOpen(false);
            setPinned(false);
          }}
          hasBattery={true}
          unread={notifications.value.filter((n) => !n.read).length}
        />
      ) : (
        <div
          class={`islet-pill${open ? " open" : ""}${hasAlert ? " has-alert" : ""}${
            character && showInNotch && !open ? " has-character" : ""
          }${focusRunning ? " focus-active" : ""}`}
          // Hit region: pad covers the notch shadow without claiming a large
          // invisible strip over the app underneath.
          data-islet-hit="8"
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={handlePillClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handlePillClick();
            }
          }}
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
      )}

      <SystemFlyouts ctrl={flyoutCtrl} />

      <Toast />

      {hasAlert ? <PermissionPrompt /> : null}

      {open ? (
        <div
          class="islet-panel"
          role="dialog"
          aria-label={APP_NAME}
          data-islet-hit="10"
        >
          {character ? (
            <div class="islet-panel-character">
              <CharacterCanvas
                surface="panel"
                signals={characterSignals(false)}
                class="islet-panel-canvas"
              />
              <div class="islet-panel-character-row">
                <span class="islet-companion-presence" aria-hidden="true" />
                <span class="islet-panel-character-name">
                  {character.manifest.name}
                </span>
                <button
                  class={`islet-character-visibility${showInNotch ? " on" : ""}`}
                  role="switch"
                  aria-checked={showInNotch}
                  title={t("settings.character.inNotch")}
                  onClick={toggleCharacterInNotch}
                >
                  <span aria-hidden="true" />
                  {showInNotch ? t("common.on") : t("common.off")}
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
            {/* key on the active tab so switching re-triggers the enter motion */}
            <div class="islet-tab-view" key={active}>
              <LazyPanel id={active} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
