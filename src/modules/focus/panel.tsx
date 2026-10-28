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
const RING = 2 * Math.PI * 67; // circumference for r=67

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
 * Focus tab with a circular progress ring, presets, and a custom-minutes input.
 * Subscribes to "islet://focus-state" only while mounted (closed == asleep).
 */
export default function FocusPanel() {
  const [state, setState] = useState<FocusState | null>(null);
  const [custom, setCustom] = useState("");

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
  const total = idle ? PRESETS[2] * 60 : state.totalSecs || 1;
  const remaining = idle ? PRESETS[2] * 60 : state.remainingSecs;
  // Fraction elapsed -> ring offset.
  const elapsed = idle ? 0 : 1 - remaining / total;
  const dashOffset = RING * (1 - elapsed);

  function startCustom() {
    const min = Math.max(1, Math.min(180, parseInt(custom, 10) || 0));
    if (min > 0) {
      setCustom("");
      void focusStart(min).then(setState);
    }
  }

  return (
    <div class="islet-focus">
      <div class="islet-focus-phase">{phaseLabel(state.phase)}</div>

      <div class={`islet-focus-ring${running ? " running" : ""}`}>
        <svg width="150" height="150" viewBox="0 0 150 150">
          <defs>
            {/* Single-hue accent ramp, top-to-bottom. Pulls its stops from the
                design tokens so the ring can never drift out of the palette
                (it used to hardcode an indigo->violet blend). */}
            <linearGradient id="islet-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--islet-accent-soft)" />
              <stop offset="100%" stop-color="var(--islet-accent-deep)" />
            </linearGradient>
          </defs>
          <circle class="track" cx="75" cy="75" r="67" />
          <circle
            class="progress"
            cx="75"
            cy="75"
            r="67"
            stroke-dasharray={RING}
            stroke-dashoffset={dashOffset}
          />
        </svg>
        <div class="islet-focus-clock" aria-live="polite">
          {mmss(remaining)}
        </div>
      </div>

      {idle ? (
        <>
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
          <form
            class="islet-focus-custom"
            onSubmit={(e) => {
              e.preventDefault();
              startCustom();
            }}
          >
            <input
              type="number"
              min={1}
              max={180}
              placeholder="custom"
              value={custom}
              aria-label={t("focus.customMinutes")}
              onInput={(e) => setCustom(e.currentTarget.value)}
            />
            <span>{t("focus.minutes")}</span>
            <button type="submit" class="islet-btn primary">
              {t("focus.start")}
            </button>
          </form>
        </>
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
