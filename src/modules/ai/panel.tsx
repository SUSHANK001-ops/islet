import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import { ensurePermission } from "../../app/permission-store";
import { setAiThinking } from "../../characters/signals-store";
import { focusStart } from "../focus/bridge";
import {
  aiGetConfig,
  aiChat,
  type AiConfigPublic,
  type ChatMessage,
} from "./bridge";

// The AI companion chat panel (Spec 15). BYOK: if no key/feature is configured,
// it shows a "set up in Settings" empty state. Before the FIRST network request
// this session it asks for consent on the notch (ensurePermission), so nothing
// is ever sent silently. All requests go through Rust -> net/ choke point.
//
// States covered: not-configured (empty), idle, sending (loading), error, and
// a normal conversation. Motion is minimal and respects reduced-motion via CSS.
export default function AiPanel() {
  const [cfg, setCfg] = useState<AiConfigPublic | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    aiGetConfig()
      .then((c) => alive && setCfg(c))
      .catch(() => alive && setCfg({
        schemaVersion: 1,
        baseUrl: "",
        model: "",
        hasKey: false,
        enabled: false,
        shareContext: false,
      }));
    return () => {
      alive = false;
    };
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const usable = !!cfg && cfg.enabled && cfg.hasKey && cfg.baseUrl.length > 0;

  // Send either the typed draft or an explicit prompt (from a coaching chip).
  async function send(explicit?: string) {
    const text = (explicit ?? draft).trim();
    if (!text || busy || !usable) return;

    // Consent on the notch before the first request leaves this PC.
    const ok = await ensurePermission({
      id: "ai-network",
      capability: "aiNetwork",
      title: t("ai.consent.title"),
      body: t("ai.consent.body", { host: hostOf(cfg!.baseUrl) }),
    });
    if (!ok) {
      setError(t("ai.consent.declined"));
      return;
    }

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    if (!explicit) setDraft("");
    setBusy(true);
    setError(null);
    // Let the character visibly "work" while the companion thinks (Spec 16).
    setAiThinking(true);
    try {
      const reply = await aiChat(next);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(typeof e === "string" ? e : t("ai.error"));
    } finally {
      setBusy(false);
      setAiThinking(false);
    }
  }

  // Coaching action: ask the companion to kick off a focus round AND actually
  // start it. The chat gives encouragement; the Rust engine runs the timer.
  async function startCoachedFocus(minutes: number) {
    if (busy || !usable) return;
    try {
      await focusStart(minutes);
    } catch {
      /* non-fatal: still send the encouragement message */
    }
    void send(t("ai.coach.startedPrompt", { minutes: String(minutes) }));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  // Loading the config.
  if (!cfg) {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }

  // Not set up: point the user at Settings. Never a dead feature.
  if (!usable) {
    return (
      <div class="islet-ai">
        <h1>{t("tab.ai")}</h1>
        <div class="islet-ai-setup">
          <span class="islet-ai-setup-icon">
            <Icon name="sparkle" size={26} />
          </span>
          <p>{t("ai.notConfigured")}</p>
          <p class="islet-dim">{t("ai.notConfiguredHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div class="islet-ai">
      <h1>{t("tab.ai")}</h1>

      <div class="islet-ai-log" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div class="islet-ai-start">
            <p class="islet-ai-greeting">{t("ai.greeting")}</p>
            {/* Coaching quick-starts: one tap sends a useful prompt. */}
            <div class="islet-ai-chips">
              <button
                class="islet-ai-chip"
                disabled={busy}
                onClick={() => void startCoachedFocus(25)}
              >
                {t("ai.coach.focus25")}
              </button>
              <button
                class="islet-ai-chip"
                disabled={busy}
                onClick={() => void send(t("ai.coach.planPrompt"))}
              >
                {t("ai.coach.plan")}
              </button>
              <button
                class="islet-ai-chip"
                disabled={busy}
                onClick={() => void send(t("ai.coach.stuckPrompt"))}
              >
                {t("ai.coach.stuck")}
              </button>
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} class={`islet-ai-msg ${m.role}`}>
              <span class="islet-ai-bubble">{m.content}</span>
            </div>
          ))
        )}
        {busy ? (
          <div class="islet-ai-msg assistant">
            <span class="islet-ai-bubble islet-ai-typing" aria-label={t("ai.thinking")}>
              <span class="islet-ai-dot" />
              <span class="islet-ai-dot" />
              <span class="islet-ai-dot" />
            </span>
          </div>
        ) : null}
      </div>

      {error ? <p class="islet-ai-error" role="alert">{error}</p> : null}

      <div class="islet-ai-compose">
        <textarea
          class="islet-ai-input"
          value={draft}
          placeholder={t("ai.placeholder")}
          aria-label={t("ai.placeholder")}
          rows={1}
          disabled={busy}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <button
          class="islet-btn primary islet-ai-send"
          onClick={() => void send()}
          disabled={busy || draft.trim().length === 0}
          aria-label={t("ai.send")}
        >
          <Icon name="arrow-up" size={18} />
        </button>
      </div>
    </div>
  );
}

// Pull a display host from a base URL for the consent card. Pure string math;
// the real allow-list/validation is in Rust.
function hostOf(url: string): string {
  const m = url.match(/^https:\/\/([^/:?#]+)/i);
  return m ? m[1] : url;
}
