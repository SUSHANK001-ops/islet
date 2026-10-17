import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import {
  charactersList,
  characterSetActive,
  characterImport,
  characterImportFile,
  characterExport,
  characterDelete,
  type CharacterSummary,
} from "../../characters/bridge";
import {
  activeRecord,
  loadActiveCharacter,
} from "../../characters/character-store";

// The Characters section of Settings: pick the active character, toggle whether
// it shows in the notch, import a pack (folder picker), and delete a pack.
// All pack logic is in Rust; this only calls the allow-listed commands and then
// reloads the active-character store so the notch/panel update live.
export function CharacterSettings() {
  const [list, setList] = useState<CharacterSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const record = activeRecord.value;

  async function refresh() {
    try {
      setList(await charactersList());
    } catch {
      setList([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function choose(id: string | null) {
    setBusy(true);
    setNotice(null);
    try {
      await characterSetActive(id, record.showInNotch);
      await loadActiveCharacter();
    } catch {
      /* non-fatal: the store keeps the previous character */
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotch() {
    setBusy(true);
    try {
      await characterSetActive(record.id, !record.showInNotch);
      await loadActiveCharacter();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setBusy(true);
    setNotice(null);
    try {
      const imported = await characterImport();
      if (imported) {
        setNotice(t("settings.character.imported", { name: imported.name }));
        await refresh();
      }
    } catch {
      setNotice(t("settings.character.importFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function doImportFile() {
    setBusy(true);
    setNotice(null);
    try {
      const imported = await characterImportFile();
      if (imported) {
        setNotice(t("settings.character.imported", { name: imported.name }));
        await refresh();
      }
    } catch {
      setNotice(t("settings.character.importFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function doExport(id: string, name: string) {
    setBusy(true);
    setNotice(null);
    try {
      const ok = await characterExport(id);
      if (ok) setNotice(t("settings.character.exported", { name }));
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(id: string) {
    setBusy(true);
    try {
      await characterDelete(id);
      await Promise.all([refresh(), loadActiveCharacter()]);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="islet-char-settings">
      <div class="islet-field">
        <span>{t("settings.character")}</span>
        <span class="islet-char-actions">
          <button class="islet-btn" onClick={doImportFile} disabled={busy}>
            {t("settings.character.importFile")}
          </button>
          <button class="islet-btn" onClick={doImport} disabled={busy}>
            {t("settings.character.import")}
          </button>
        </span>
      </div>

      <label class="islet-field">
        <span>{t("settings.character.inNotch")}</span>
        <button
          class={`islet-toggle${record.showInNotch ? " on" : ""}`}
          role="switch"
          aria-checked={record.showInNotch}
          onClick={toggleNotch}
          disabled={busy}
        >
          {record.showInNotch ? t("common.on") : t("common.off")}
        </button>
      </label>

      {list.length === 0 ? (
        <p class="islet-char-empty">{t("settings.character.empty")}</p>
      ) : (
        <ul class="islet-char-list">
          {/* "None" option so the user can turn the character off entirely. */}
          <li>
            <button
              class={`islet-char-row${record.id === null ? " active" : ""}`}
              onClick={() => choose(null)}
              disabled={busy}
            >
              <span class="islet-char-name">{t("settings.character.none")}</span>
              {record.id === null ? (
                <span class="islet-char-badge">{t("settings.character.active")}</span>
              ) : null}
            </button>
          </li>

          {list.map((c) => (
            <li key={c.id}>
              <button
                class={`islet-char-row${record.id === c.id ? " active" : ""}${
                  c.valid ? "" : " invalid"
                }`}
                onClick={() => c.valid && choose(c.id)}
                disabled={busy || !c.valid}
                title={c.problem ?? undefined}
              >
                <span class="islet-char-name">
                  {c.name || c.id}
                  {!c.valid ? (
                    <span class="islet-char-sub">
                      {" · "}
                      {t("settings.character.invalid")}
                    </span>
                  ) : null}
                </span>
                {record.id === c.id ? (
                  <span class="islet-char-badge">
                    {t("settings.character.active")}
                  </span>
                ) : null}
              </button>
              <button
                class="islet-icon-btn"
                aria-label={t("settings.character.export")}
                title={t("settings.character.export")}
                onClick={() => doExport(c.id, c.name || c.id)}
                disabled={busy}
              >
                ⤓
              </button>
              <button
                class="islet-icon-btn"
                aria-label={t("settings.character.delete")}
                onClick={() => doDelete(c.id)}
                disabled={busy}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {notice ? <p class="islet-char-notice">{notice}</p> : null}
    </div>
  );
}
