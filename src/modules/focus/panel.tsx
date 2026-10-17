import { useEffect, useState } from "preact/hooks";
import { listen } from "@tauri-apps/api/event";
import { t } from "../../ui/i18n";
import {
  focusStart,
  focusPause,
  focusResume,
  focusReset,
  focusGetState,
  type FocusState,
} from "./bridge";

const PRESETS = [5, 10, 25];
const POMODORO_TOTAL = 4; // display only; engine owns the real cycle

function mmss(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function phaseLabel(p: FocusState["phase"]): string {
  switch (p) {
    case "work":
      return t("focus.working");
    case "shortBreak":
      return t("focus.shortBreak");
    case "longBreak":
      return t("focus.longBreak");
    default:
      return t("focus.idle");
  }
}

/**
 * Focus tab. Subscribes to "islet://focus-state" only while mounted, so a
 * closed panel does no work (closed == asleep). The Rust engine keeps the real
 * time; this view just reflects and controls it.
 */
export default function FocusPanel() {
  const [state, setState] = useState<FocusState | null>(null);

  useEffect(() => {
    let alive = true;
    focusGetState()
      .then((s) => alive && setState(s))
      .catch(() => {});
    const un = listen<FocusState>("islet://focus-state", (e) => {
      if (alive) setState(e.payload);
    });
    return () => {
      alive = false;
      void un.then((f) => f());
    };
  }, []);

  if (!state) {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }

  const idle = state.phase === "idle";
  const running = state.runState === "running";
  const display = idle ? PRESETS[2] * 60 : state.remainingSecs;

  return (
    <div class="islet-focus">
      <div class="islet-focus-phase">{phaseLabel(state.phase)}</div>
      <div class="islet-focus-clock" aria-live="polite">
        {mmss(display)}
      </div>

      {idle ? (
        <div class="islet-focus-presets">
          {PRESETS.map((min) => (
            <button
              key={min}
              class="islet-btn"
              onClick={() => void focusStart(min).then(setState)}
            >
              {t("focus.preset", { min })}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div class="islet-focus-controls">
            {running ? (
              <button class="islet-btn" onClick={() => void focusPause().then(setState)}>
                {t("focus.pause")}
              </button>
            ) : (
              <button
                class="islet-btn primary"
                onClick={() => void focusResume().then(setState)}
              >
                {t("focus.resume")}
              </button>
            )}
            <button class="islet-btn danger" onClick={() => void focusReset().then(setState)}>
              {t("focus.reset")}
            </button>
          </div>
          <div class="islet-focus-meta">
            <span>
              {t("focus.round", {
                n: state.completedRounds + 1,
                total: POMODORO_TOTAL,
              })}
            </span>
            <span>{t("focus.todayCount", { n: state.roundsToday })}</span>
          </div>
        </>
      )}
    </div>
  );
}
