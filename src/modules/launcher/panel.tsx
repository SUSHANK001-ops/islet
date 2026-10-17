import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import {
  launcherList,
  launcherAdd,
  launcherRemove,
  launcherLaunch,
  type LauncherEntry,
} from "./bridge";

// The safe app launcher panel. Lists the user's apps, launches by id, adds via
// the OS picker, and removes. All validation + launching is in Rust; this UI
// only ever sends ids and never a path.
export default function LauncherPanel() {
  const [entries, setEntries] = useState<LauncherEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await launcherList();
      setEntries(list.entries);
    } catch {
      setEntries([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const list = await launcherAdd();
      if (list) setEntries(list.entries);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function launch(id: string) {
    setError(null);
    try {
      await launcherLaunch(id);
    } catch (e) {
      // Re-validation failed (file moved/deleted/became a script): tell the user.
      setError(String(e));
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const list = await launcherRemove(id);
      setEntries(list.entries);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  // Loading state.
  if (entries === null) {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }

  return (
    <div class="islet-launcher">
      <div class="islet-launcher-head">
        <button class="islet-btn primary" onClick={add} disabled={busy}>
          {t("launcher.add")}
        </button>
      </div>

      {error ? (
        <div class="islet-notice" role="status">
          <span>{error}</span>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div class="islet-empty">
          <span class="islet-empty-icon">🚀</span>
          <span>{t("launcher.empty")}</span>
        </div>
      ) : (
        <ul class="islet-launcher-list">
          {entries.map((e) => (
            <li key={e.id} class="islet-launcher-item">
              <button
                class="islet-launcher-launch"
                onClick={() => launch(e.id)}
                title={e.path}
              >
                <span class="islet-launcher-name">{e.name}</span>
                <span class="islet-launcher-path">{e.path}</span>
              </button>
              <button
                class="islet-icon-btn"
                aria-label={t("launcher.remove")}
                onClick={() => remove(e.id)}
                disabled={busy}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
