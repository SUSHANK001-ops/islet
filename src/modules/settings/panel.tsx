import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import {
  settings,
  updateSettings,
  moveTab,
  toggleTab,
} from "../../app/settings-store";
import { listMonitors, setMonitor } from "../../app/window-bridge";
import { getAutostart, setAutostart } from "../../app/autostart-bridge";

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

      <div class="islet-field">
        <span>{t("settings.hotkey")}</span>
        <code class="islet-kbd">Ctrl + Shift + Space</code>
      </div>

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
                  aria-label="Move up"
                  onClick={() => moveTab(tab.id, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label="Move down"
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
