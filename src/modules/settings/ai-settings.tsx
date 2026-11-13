import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import {
  aiGetConfig,
  aiSetConfig,
  type AiConfigPublic,
} from "../ai/bridge";

// The AI companion section of Settings (Spec 15). BYOK: the user pastes a key
// for an OpenAI-compatible provider. The key is write-only from the UI — the
// getter returns `hasKey`, never the secret, and the actual request happens in
// Rust through the net/ choke point. Saving syncs the provider host into the
// network allow-list on the Rust side.
export function AiSettings() {
  const [cfg, setCfg] = useState<AiConfigPublic | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  // null = keep existing key; string = replace; "" (after edit) = clear.
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [shareContext, setShareContext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    aiGetConfig()
      .then((c) => {
        if (!alive) return;
        setCfg(c);
        setBaseUrl(c.baseUrl);
        setModel(c.model);
        setEnabled(c.enabled);
        setShareContext(c.shareContext);
      })
      .catch(() => alive && setCfg({
        schemaVersion: 1,
        baseUrl: "https://api.groq.com/openai/v1",
        model: "llama-3.1-8b-instant",
        hasKey: false,
        enabled: false,
        shareContext: false,
      }));
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const updated = await aiSetConfig({
        baseUrl,
        model,
        apiKey: keyDraft, // null keeps existing
        enabled,
        shareContext,
      });
      setCfg(updated);
      setKeyDraft(null);
      setNotice(t("settings.ai.saved"));
    } catch {
      setNotice(t("settings.ai.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) {
    return <p class="islet-dim">{t("common.loading")}</p>;
  }

  return (
    <div class="islet-ai-settings">
      <p class="islet-dim islet-net-intro">{t("settings.ai.intro")}</p>

      <label class="islet-field">
        <span>{t("settings.ai.enabled")}</span>
        <button
          class={`islet-toggle${enabled ? " on" : ""}`}
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          disabled={busy}
        >
          {enabled ? t("common.on") : t("common.off")}
        </button>
      </label>

      <label class="islet-field islet-field-col">
        <span>{t("settings.ai.baseUrl")}</span>
        <input
          class="islet-text-input"
          type="url"
          value={baseUrl}
          onInput={(e) => setBaseUrl(e.currentTarget.value)}
          disabled={busy}
          placeholder="https://api.groq.com/openai/v1"
        />
      </label>

      <label class="islet-field islet-field-col">
        <span>{t("settings.ai.model")}</span>
        <input
          class="islet-text-input"
          type="text"
          value={model}
          onInput={(e) => setModel(e.currentTarget.value)}
          disabled={busy}
          placeholder="llama-3.1-8b-instant"
        />
      </label>

      <label class="islet-field islet-field-col">
        <span>{t("settings.ai.key")}</span>
        <input
          class="islet-text-input"
          type="password"
          autocomplete="off"
          value={keyDraft ?? ""}
          onInput={(e) => setKeyDraft(e.currentTarget.value)}
          disabled={busy}
          placeholder={
            cfg.hasKey && keyDraft === null
              ? t("settings.ai.keySet")
              : t("settings.ai.keyPlaceholder")
          }
        />
      </label>

      <label class="islet-field">
        <span>{t("settings.ai.shareContext")}</span>
        <button
          class={`islet-toggle${shareContext ? " on" : ""}`}
          role="switch"
          aria-checked={shareContext}
          onClick={() => setShareContext((v) => !v)}
          disabled={busy}
        >
          {shareContext ? t("common.on") : t("common.off")}
        </button>
      </label>
      <p class="islet-dim islet-ai-hint">{t("settings.ai.shareContextHint")}</p>

      <div class="islet-field">
        <span />
        <button class="islet-btn primary" onClick={save} disabled={busy}>
          {t("settings.ai.save")}
        </button>
      </div>

      {notice ? <p class="islet-char-notice">{notice}</p> : null}
    </div>
  );
}
