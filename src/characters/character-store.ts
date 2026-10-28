import { signal } from "@preact/signals";
import { listen } from "@tauri-apps/api/event";
import { powerGet } from "../system/bridge";
import { progressSummary } from "../modules/progress/bridge";
import {
  characterGetActive,
  characterLoadActive,
  type ActiveCharacter,
  type LoadedCharacter,
} from "./bridge";

// Reactive state for the active character and the "may I animate?" gate.
//
// The renderer components read these signals. Rust owns the pack data; this
// store only holds the loaded result plus the runtime conditions that decide
// whether animation is allowed (AGENTS.md hard-stop conditions + reduced
// motion + battery saver).

/** The loaded, validated active character, or null when none/invalid. */
export const activeCharacter = signal<LoadedCharacter | null>(null);

/** The active-character record (id + showInNotch). */
export const activeRecord = signal<ActiveCharacter>({
  schemaVersion: 1,
  id: null,
  showInNotch: true,
});

/** Lifetime focus minutes, drives the growth stage. Starts at 0 so a brand-new
 *  user is at the first stage; `refreshFocusTotal()` fills it in from the
 *  activity log. */
export const totalFocusMinutes = signal(0);

/**
 * Recompute lifetime focus minutes from the activity log.
 *
 * Growth stages were dead before this existed: the signal was initialised to 0
 * and never written, so `resolveStage()` always returned the first stage no
 * matter how much the user had focused. Called at startup and whenever a focus
 * round completes.
 *
 * The window is capped (two years) because the backend zero-fills every day in
 * the range, so an unbounded span would grow the payload forever.
 */
export async function refreshFocusTotal(): Promise<void> {
  try {
    const days = await progressSummary(730);
    totalFocusMinutes.value = days.reduce((sum, d) => sum + d.focusMinutes, 0);
  } catch {
    // Outside Tauri or the command failed: leave the previous total rather than
    // resetting the character's growth stage to zero.
  }
}

/** True while the character load is in flight (loading state in the UI). */
export const characterLoading = signal(false);

/** Set once a load attempt finished and found no usable character. */
export const characterProblem = signal<string | null>(null);

// ---- Hard-stop gate ----
// Animation is allowed only when NONE of these block it. Each is a boolean that
// is true when that condition wants animation STOPPED.

const pageHidden = signal(false);
const reducedMotion = signal(false);
const fullscreenApp = signal(false);
/** Windows "Energy Saver" is actually ON. A hard stop. */
const batterySaver = signal(false);
/** Merely running unplugged. NOT a hard stop - it slows animation down. */
const onBattery = signal(false);

/**
 * May the character animate at all right now? When false, surfaces draw a
 * single static frame instead of running a loop (closed == cheap; respect the
 * user's system preferences).
 *
 * WHY being on battery is NOT in this list: it used to be, via
 * `batterySaver = !battery.charging`, which froze the character on every
 * unplugged laptop. AGENTS.md marks on-battery as a `(configurable)` stop and
 * its budget table says battery makes animation SLOW, not stop - only real
 * battery saver is a hard stop. See `fpsScale()` for the slowdown.
 */
export function animationAllowed(): boolean {
  return (
    !pageHidden.value &&
    !reducedMotion.value &&
    !fullscreenApp.value &&
    !batterySaver.value
  );
}

/**
 * Multiplier applied to a state's fps. Running unplugged halves the frame rate
 * so the character still feels alive while costing about half the CPU.
 */
export function fpsScale(): number {
  return onBattery.value ? 0.5 : 1;
}

/** A monotonically changing token the renderer watches to re-evaluate gates. */
export const gateVersion = signal(0);
function bumpGate() {
  gateVersion.value = gateVersion.value + 1;
}

let wired = false;

/** Wire the hard-stop listeners once. Safe to call outside Tauri (no-ops). */
export function initCharacterGate(): void {
  if (wired) return;
  wired = true;

  if (typeof document !== "undefined") {
    // Page Visibility covers minimize / screen-lock / occlusion in WebView2:
    // when hidden we stop animating entirely (a documented, event-driven stop).
    const onVis = () => {
      pageHidden.value = document.hidden;
      bumpGate();
    };
    document.addEventListener("visibilitychange", onVis);
    onVis();
  }

  if (typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => {
      reducedMotion.value = mq.matches;
      bumpGate();
    };
    // addEventListener for modern browsers; the older addListener is a fallback.
    if (mq.addEventListener) mq.addEventListener("change", onMq);
    onMq();
  }

  // Power state. Rust is the source of truth: GetSystemPowerStatus reports
  // whether Energy Saver is genuinely ON, which the web Battery API cannot.
  //
  // Event-driven, no polling (AGENTS.md): we read once at startup and again on
  // the browser's free `chargingchange` event, which fires on plug/unplug. A
  // saver toggle that happens without a power-source change is therefore picked
  // up on the next plug/unplug or restart - acceptable, and cheaper than a poll.
  const refreshPower = () => {
    void powerGet()
      .then((p) => {
        batterySaver.value = p.saver;
        onBattery.value = p.hasBattery && !p.charging;
        bumpGate();
      })
      .catch(() => {
        // Outside Tauri / command unavailable: never block animation on a
        // failed power read, or the character silently freezes again.
        batterySaver.value = false;
        onBattery.value = false;
        bumpGate();
      });
  };
  refreshPower();

  type BatteryLike = {
    addEventListener?: (t: string, cb: () => void) => void;
  };
  const navAny = navigator as unknown as {
    getBattery?: () => Promise<BatteryLike>;
  };
  if (navAny.getBattery) {
    navAny
      .getBattery()
      .then((b) => {
        b.addEventListener?.("chargingchange", refreshPower);
      })
      .catch(() => {});
  }

  // Fullscreen app appeared/left: the backend emits this (wired in a later
  // spec). Subscribing now is harmless and future-proof - until it is emitted
  // this simply never fires.
  void listen<boolean>("islet://fullscreen-changed", (e) => {
    fullscreenApp.value = e.payload === true;
    bumpGate();
  }).catch(() => {});
}

/**
 * Load (or reload) the active character from Rust. Call at startup and after
 * the user switches/imports/deletes a character.
 */
export async function loadActiveCharacter(): Promise<void> {
  characterLoading.value = true;
  characterProblem.value = null;
  try {
    const [record, loaded] = await Promise.all([
      characterGetActive(),
      characterLoadActive(),
    ]);
    activeRecord.value = record;
    activeCharacter.value = loaded;
    if (record.id && !loaded) {
      // A character is chosen but could not be loaded (e.g. art not dropped in
      // yet, or a pack went invalid). Surface a gentle message, show nothing.
      characterProblem.value = "character-unavailable";
    }
  } catch {
    // Outside Tauri or a backend fault: no character, no crash.
    activeCharacter.value = null;
  } finally {
    characterLoading.value = false;
  }
}
