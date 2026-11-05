import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import {
  launcherList,
  launcherAdd,
  launcherRemove,
  launcherRename,
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

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

  async function rename() {
    const name = editingName.trim();
    if (!editingId || !name) return;
    setBusy(true);
    try {
      const list = await launcherRename(editingId, name);
      setEntries(list.entries);
      setEditingId(null);
      setEditingName("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
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
          <Icon name="grid" size={24} class="islet-empty-icon" />
          <span>{t("launcher.empty")}</span>
        </div>
      ) : (
        <ul class="islet-launcher-list">
          {entries.map((entry) => (
            <li key={entry.id} class="islet-launcher-item">
              {editingId === entry.id ? (
                <form class="islet-launcher-rename" onSubmit={(event) => { event.preventDefault(); void rename(); }}>
                  <input
                    class="islet-input"
                    autoFocus
                    value={editingName}
                    maxLength={60}
                    aria-label={t("launcher.renamePlaceholder")}
                    onInput={(event) => setEditingName(event.currentTarget.value)}
                  />
                  <button class="islet-btn primary" type="submit" disabled={!editingName.trim() || busy}>
                    {t("launcher.saveName")}
                  </button>
                </form>
              ) : (
                <button
                  class="islet-launcher-launch"
                  onClick={() => launch(entry.id)}
                  title={entry.path}
                >
                  <span class="islet-launcher-name">{entry.name}</span>
                  <span class="islet-launcher-path">{entry.path}</span>
                </button>
              )}
              <button
                class="islet-icon-btn"
                aria-label={t("launcher.rename")}
                onClick={() => {
                  setEditingId(entry.id);
                  setEditingName(entry.name);
                }}
                disabled={busy}
              >
                <Icon name="edit" size={16} />
              </button>
              <button
                class="islet-icon-btn"
                aria-label={t("launcher.remove")}
                onClick={() => remove(entry.id)}
                disabled={busy}
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
