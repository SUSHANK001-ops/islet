import { signal } from "@preact/signals";
import { listen } from "@tauri-apps/api/event";
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
const batterySaver = signal(false);

/**
 * May the character animate at all right now? When false, surfaces draw a
 * single static frame instead of running a loop (closed == cheap; respect the
 * user's system preferences).
 */
export function animationAllowed(): boolean {
  return (
    !pageHidden.value &&
    !reducedMotion.value &&
    !fullscreenApp.value &&
    !batterySaver.value
  );
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

  // Battery saver: pause animation while on battery / in saver mode where the
  // API exists. Treated as best-effort (not all platforms expose it).
  type BatteryLike = { charging: boolean; addEventListener?: (t: string, cb: () => void) => void };
  const navAny = navigator as unknown as {
    getBattery?: () => Promise<BatteryLike>;
  };
  if (navAny.getBattery) {
    navAny
      .getBattery()
      .then((b) => {
        const onBatt = () => {
          batterySaver.value = !b.charging;
          bumpGate();
        };
        b.addEventListener?.("chargingchange", onBatt);
        onBatt();
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
