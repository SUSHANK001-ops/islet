import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon, type IconName } from "../../ui/controls/icon";
import {
  agentsPoll,
  agentsDecide,
  agentsClear,
  type AgentEvent,
  type AgentLog,
} from "./bridge";

// Coding-agent session companion panel (Spec 17). Shows what a supported local
// agent is doing and surfaces its command-approval requests. READ-ONLY: the
// only action is recording a human approve/decline; Islet runs nothing.
//
// Poll only while this panel is mounted (a slow interval), honoring the
// "poll only while needed" rule — there is no OS event for agent activity.
const POLL_MS = 2500;

const KIND_ICON: Record<string, IconName> = {
  file_read: "note",
  file_edit: "edit",
  command_proposed: "sparkle",
  status: "sliders",
};

export default function AgentsPanel() {
  const [log, setLog] = useState<AgentLog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  async function poll() {
    try {
      const next = await agentsPoll();
      if (alive.current) {
        setLog(next);
        setFailed(false);
      }
    } catch {
      if (alive.current) setFailed(true);
    }
  }

  useEffect(() => {
    alive.current = true;
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, []);

  async function decide(id: string, approve: boolean) {
    setBusyId(id);
    try {
      const next = await agentsDecide(id, approve);
      if (alive.current) setLog(next);
    } catch {
      /* non-fatal */
    } finally {
      if (alive.current) setBusyId(null);
    }
  }

  async function clearAll() {
    try {
      await agentsClear();
      if (alive.current) setLog({ schemaVersion: 1, events: [] });
    } catch {
      /* non-fatal */
    }
  }

  // Loading.
  if (!log) {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }

  // Error (not in Tauri / command failed).
  if (failed && log.events.length === 0) {
    return (
      <div class="islet-agents">
        <h1>{t("tab.agents")}</h1>
        <div class="islet-empty">{t("common.error")}</div>
      </div>
    );
  }

  return (
    <div class="islet-agents">
      <div class="islet-agents-head">
        <h1>{t("tab.agents")}</h1>
        {log.events.length > 0 ? (
          <button class="islet-btn" onClick={clearAll}>
            {t("agents.clear")}
          </button>
        ) : null}
      </div>
      <p class="islet-dim islet-agents-intro">{t("agents.intro")}</p>

      {log.events.length === 0 ? (
        <div class="islet-agents-empty">
          <p>{t("agents.empty")}</p>
          <p class="islet-dim">{t("agents.emptyHint")}</p>
        </div>
      ) : (
        <ul class="islet-agents-list">
          {log.events.map((e) => (
            <AgentRow
              key={e.id}
              event={e}
              busy={busyId === e.id}
              onDecide={decide}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AgentRow({
  event: e,
  busy,
  onDecide,
}: {
  event: AgentEvent;
  busy: boolean;
  onDecide: (id: string, approve: boolean) => void;
}) {
  const needsDecision = e.kind === "command_proposed" && e.decision === "pending";
  return (
    <li class={`islet-agent-row kind-${e.kind}`}>
      <span class="islet-agent-icon">
        <Icon name={KIND_ICON[e.kind] ?? "sliders"} size={16} />
      </span>
      <span class="islet-agent-main">
        <span class="islet-agent-title">{e.title}</span>
        <span class="islet-dim islet-agent-meta">
          {e.agent} · {e.time}
          {e.path ? ` · ${e.path}` : ""}
        </span>
        {/* Command text is shown verbatim so the human sees exactly what the
            agent proposes to run. Islet never executes it. */}
        {e.detail ? <code class="islet-agent-detail">{e.detail}</code> : null}

        {e.kind === "command_proposed" && e.decision !== "pending" ? (
          <span class={`islet-agent-verdict ${e.decision}`}>
            {e.decision === "approved"
              ? t("agents.approved")
              : t("agents.declined")}
          </span>
        ) : null}
      </span>

      {needsDecision ? (
        <span class="islet-agent-actions">
          <button
            class="islet-btn danger"
            disabled={busy}
            onClick={() => onDecide(e.id, false)}
          >
            {t("agents.decline")}
          </button>
          <button
            class="islet-btn primary"
            disabled={busy}
            onClick={() => onDecide(e.id, true)}
          >
            {t("agents.approve")}
          </button>
        </span>
      ) : null}
    </li>
  );
}
