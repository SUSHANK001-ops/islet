import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import {
  catalogIsConfigured,
  catalogFetch,
  catalogPreview,
  catalogInstall,
  type CatalogEntry,
} from "../../characters/catalog-bridge";
import { charactersList } from "../../characters/bridge";
import { loadActiveCharacter } from "../../characters/character-store";

// Browse characters (Spec 13). User-started catalog download screen. Nothing is
// contacted until the user taps "Browse" (the consent step), and only the one
// allow-listed host is reached (enforced in Rust). Shows clear states for
// not-set-up, loading, offline/error, and empty.
type Phase = "idle" | "loading" | "ready" | "error" | "notConfigured";

export function BrowseCharacters() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshInstalled() {
    try {
      const list = await charactersList();
      setInstalled(new Set(list.map((c) => c.id)));
    } catch {
      /* ignore */
    }
  }

  // The consent step: the first fetch happens only on this explicit action.
  async function browse() {
    setError(null);
    if (!(await catalogIsConfigured().catch(() => false))) {
      setPhase("notConfigured");
      return;
    }
    setPhase("loading");
    try {
      const list = await catalogFetch();
      setEntries(list);
      setPhase("ready");
      await refreshInstalled();
      // Fetch previews lazily (verified in Rust); ignore individual failures.
      for (const e of list) {
        if (e.previewFile) {
          catalogPreview(e.id)
            .then((url) => {
              if (url) setPreviews((p) => ({ ...p, [e.id]: url }));
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  async function install(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await catalogInstall(id);
      await Promise.all([refreshInstalled(), loadActiveCharacter()]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void refreshInstalled();
  }, []);

  if (phase === "idle") {
    return (
      <div class="islet-browse-intro">
        <p class="islet-dim">{t("browse.intro")}</p>
        <button class="islet-btn primary" onClick={browse}>
          {t("browse.open")}
        </button>
      </div>
    );
  }
  if (phase === "notConfigured") {
    return <div class="islet-empty">{t("browse.notConfigured")}</div>;
  }
  if (phase === "loading") {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }
  if (phase === "error") {
    return (
      <div class="islet-browse-intro">
        <div class="islet-empty">{error ?? t("common.error")}</div>
        <button class="islet-btn" onClick={browse}>
          {t("browse.retry")}
        </button>
      </div>
    );
  }
  if (entries.length === 0) {
    return <div class="islet-empty">{t("browse.empty")}</div>;
  }

  return (
    <div>
      {error ? <div class="islet-notice" role="status"><span>{error}</span></div> : null}
      <div class="islet-browse-grid">
        {entries.map((e) => {
          const isInstalled = installed.has(e.id);
          const kb = Math.round(e.packSizeBytes / 1024);
          return (
            <div class="islet-browse-card" key={e.id}>
              <div class="islet-browse-prev">
                {previews[e.id] ? (
                  <img src={previews[e.id]} alt="" width={64} height={64} />
                ) : (
                  <span class="islet-browse-prev-ph" aria-hidden="true">·</span>
                )}
              </div>
              <div class="islet-browse-meta">
                <span class="islet-browse-name">{e.name}</span>
                <span class="islet-browse-author">{e.author}</span>
                <span class="islet-browse-badges">
                  <span class="islet-license-badge">{e.license}</span>
                  <span class="islet-dim islet-num">{kb} KB</span>
                </span>
              </div>
              <button
                class={`islet-btn${isInstalled ? "" : " primary"}`}
                disabled={isInstalled || busyId === e.id}
                onClick={() => install(e.id)}
              >
                {isInstalled
                  ? t("browse.installed")
                  : busyId === e.id
                    ? t("browse.installing")
                    : t("browse.install")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
