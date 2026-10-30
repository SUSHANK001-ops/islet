import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import {
  settings,
  updateSettings,
  moveTab,
  toggleTab,
} from "../../app/settings-store";
import {
  listMonitors,
  setMonitor,
  setNotchPosition,
  clearNotchFreePosition,
} from "../../app/window-bridge";
import { getAutostart, setAutostart } from "../../app/autostart-bridge";
import { setHiddenFromCapture } from "../../app/window-bridge";
import type { NotchPosition } from "../../app/settings-store";
import { CharacterSettings } from "./character-settings";

// Settings tab. Covers Spec 1: theme, monitor choice, launch-at-startup,
// tabs on/off + reorder, and the (fixed for now) toggle shortcut.
export default function SettingsPanel() {
  const s = settings.value;
  const [monitors, setMonitors] = useState<string[]>([]);

  // Load the monitor list once and sync the real autostart state on mount.
  useEffect(() => {
    let alive = true;
    listMonitors()
      .then((m) => alive && setMonitors(m))
      .catch(() => {});
    getAutostart()
      .then((on) => alive && updateSettings({ launchAtStartup: on }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function onThemeChange(theme: "light" | "dark") {
    updateSettings({ theme });
  }

  function onMonitorChange(name: string) {
    const value = name === "" ? null : name;
    updateSettings({ monitorName: value });
    void setMonitor(value);
  }

  async function onStartupToggle() {
    const next = !s.launchAtStartup;
    const actual = await setAutostart(next);
    updateSettings({ launchAtStartup: actual });
  }

  function onNotchPositionChange(pos: NotchPosition) {
    // Choosing a preset clears any free-dragged position (the backend does this
    // too; mirror it in the store so the UI stays consistent).
    updateSettings({ notchPosition: pos, notchFree: null });
    void setNotchPosition(pos);
  }

  function onResetPosition() {
    updateSettings({ notchFree: null });
    void clearNotchFreePosition();
  }

  function onCaptureToggle() {
    const next = !s.hiddenFromCapture;
    updateSettings({ hiddenFromCapture: next });
    void setHiddenFromCapture(next).catch(() => {});
  }

  function onGameModeToggle() {
    // Takes effect on next launch (the watcher starts at startup). Persist now.
    updateSettings({ gameMode: !s.gameMode });
  }

  function onNotchOpacityChange(value: number) {
    // Clamp to a sensible visible range so the notch never fully disappears.
    const clamped = Math.min(1, Math.max(0.2, value));
    updateSettings({ notchOpacity: clamped });
  }

  return (
    <div class="islet-settings">
      <h1>{t("settings.title")}</h1>

      <label class="islet-field">
        <span>{t("settings.theme")}</span>
        <select
          value={s.theme}
          onChange={(e) =>
            onThemeChange((e.currentTarget.value as "light" | "dark"))
          }
        >
          <option value="dark">{t("settings.theme.dark")}</option>
          <option value="light">{t("settings.theme.light")}</option>
        </select>
      </label>

      <label class="islet-field">
        <span>{t("settings.monitor")}</span>
        <select
          value={s.monitorName ?? ""}
          onChange={(e) => onMonitorChange(e.currentTarget.value)}
        >
          <option value="">{t("settings.monitor.primary")}</option>
          {monitors.map((m) => (
            <option value={m} key={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label class="islet-field">
        <span>{t("settings.pillStyle")}</span>
        <select
          value={s.pillStyle}
          onChange={(e) =>
            updateSettings({
              pillStyle: e.currentTarget.value === "statusBar" ? "statusBar" : "notch",
            })
          }
        >
          <option value="notch">{t("settings.pillStyle.notch")}</option>
          <option value="statusBar">{t("settings.pillStyle.statusBar")}</option>
        </select>
      </label>

      <label class="islet-field">
        <span>{t("settings.openOnHover")}</span>
        <button
          class={`islet-toggle${s.openOnHover ? " on" : ""}`}
          role="switch"
          aria-checked={s.openOnHover}
          onClick={() => updateSettings({ openOnHover: !s.openOnHover })}
        >
          {s.openOnHover ? t("common.on") : t("common.off")}
        </button>
      </label>

      <label class="islet-field">
        <span>{t("settings.visibility")}</span>
        <select
          value={s.pillVisibility}
          onChange={(e) =>
            updateSettings({
              pillVisibility: e.currentTarget.value as
                | "always"
                | "autoHide"
                | "hidden",
            })
          }
        >
          <option value="always">{t("settings.visibility.always")}</option>
          <option value="autoHide">{t("settings.visibility.autoHide")}</option>
          <option value="hidden">{t("settings.visibility.hidden")}</option>
        </select>
      </label>

      {s.pillVisibility === "autoHide" ? (
        <label class="islet-field">
          <span>{t("settings.autohideDelay")}</span>
          <input
            type="range"
            min={100}
            max={2000}
            step={100}
            value={s.autohideDelayMs}
            onInput={(e) =>
              updateSettings({ autohideDelayMs: Number(e.currentTarget.value) })
            }
          />
        </label>
      ) : null}

      <label class="islet-field">
        <span>{t("settings.notchPosition")}</span>
        <select
          value={s.notchPosition}
          onChange={(e) =>
            onNotchPositionChange(e.currentTarget.value as NotchPosition)
          }
        >
          <option value="left">{t("settings.notchPosition.left")}</option>
          <option value="center">{t("settings.notchPosition.center")}</option>
          <option value="right">{t("settings.notchPosition.right")}</option>
        </select>
      </label>

      {s.notchFree ? (
        <div class="islet-field">
          <span>{t("settings.notchPosition.reset")}</span>
          <button class="islet-btn" onClick={onResetPosition}>
            {t("settings.notchPosition.reset")}
          </button>
        </div>
      ) : null}

      <label class="islet-field">
        <span>{t("settings.notchOpacity")}</span>
        <input
          type="range"
          min={20}
          max={100}
          step={5}
          value={Math.round(s.notchOpacity * 100)}
          onInput={(e) =>
            onNotchOpacityChange(Number(e.currentTarget.value) / 100)
          }
        />
      </label>

      <label class="islet-field">
        <span>{t("settings.startup")}</span>
        <button
          class={`islet-toggle${s.launchAtStartup ? " on" : ""}`}
          role="switch"
          aria-checked={s.launchAtStartup}
          onClick={onStartupToggle}
        >
          {s.launchAtStartup ? t("common.on") : t("common.off")}
        </button>
      </label>

      <label class="islet-field">
        <span>{t("settings.hideFromCapture")}</span>
        <button
          class={`islet-toggle${s.hiddenFromCapture ? " on" : ""}`}
          role="switch"
          aria-checked={s.hiddenFromCapture}
          onClick={onCaptureToggle}
        >
          {s.hiddenFromCapture ? t("common.on") : t("common.off")}
        </button>
      </label>

      <label class="islet-field">
        <span>{t("settings.gameMode")}</span>
        <button
          class={`islet-toggle${s.gameMode ? " on" : ""}`}
          role="switch"
          aria-checked={s.gameMode}
          onClick={onGameModeToggle}
        >
          {s.gameMode ? t("common.on") : t("common.off")}
        </button>
      </label>

      <div class="islet-field">
        <span>{t("settings.hotkey")}</span>
        <code class="islet-kbd">Ctrl + Shift + Space</code>
      </div>

      <CharacterSettings />

      <div class="islet-tabs-editor">
        <span>{t("settings.tabs")}</span>
        <ul>
          {s.tabs.map((tab) => (
            <li key={tab.id}>
              <button
                class={`islet-toggle small${tab.enabled ? " on" : ""}`}
                role="switch"
                aria-checked={tab.enabled}
                onClick={() => toggleTab(tab.id)}
              >
                {t(`tab.${tab.id}`)}
              </button>
              <span class="islet-reorder">
                <button
                  aria-label={t("settings.moveUp")}
                  onClick={() => moveTab(tab.id, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={t("settings.moveDown")}
                  onClick={() => moveTab(tab.id, 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
