import { invoke } from "@tauri-apps/api/core";

/**
 * Publishes the rectangles of everything VISIBLE to Rust, which reshapes the
 * OS window to match (see src-tauri/src/window/hit_region.rs).
 *
 * WHY this exists: the island is ONE fixed 640x720 transparent window, but what
 * you can see is usually a small notch. Without a region, that whole invisible
 * rectangle swallows clicks and hover at the top of the screen, so the desktop
 * and other apps underneath stop responding. CSS `pointer-events: none` cannot
 * fix this because WebView2 still consumes the OS mouse message.
 */

export interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  pad: number;
}

const DEFAULT_PAD = 12;
const MAX_RADIUS = 48;

function readPad(el: HTMLElement): number {
  const raw = el.dataset.isletHit;
  if (!raw) return DEFAULT_PAD;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_PAD;
}

function readRadius(el: HTMLElement, w: number, h: number): number {
  const raw = getComputedStyle(el).borderBottomRightRadius;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(n, Math.min(w, h) / 2, MAX_RADIUS);
}

/** Measure every marked surface currently in the DOM. */
export function measureHitRects(): HitRect[] {
  const out: HitRect[] = [];
  const nodes = document.querySelectorAll<HTMLElement>("[data-islet-hit]");
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push({
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      radius: readRadius(el, r.width, r.height),
      pad: readPad(el),
    });
  }
  return out;
}

function keyFor(rects: HitRect[]): string {
  return rects
    .map(
      (r) =>
        `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(
          r.h
        )},${Math.round(r.radius)},${r.pad}`
    )
    .join("|");
}

interface PendingRegion {
  key: string;
  rects: HitRect[];
}

let lastApplied = "";
let pending: PendingRegion | null = null;
let inFlight = false;
let frame = 0;

/**
 * Send region changes one at a time with latest-wins queuing. Tauri invokes can
 * complete out of order when layout changes quickly; serializing them prevents
 * an older panel rectangle from replacing the newer closed-notch rectangle.
 */
async function pump(): Promise<void> {
  if (inFlight || !pending) return;
  const next = pending;
  pending = null;
  if (next.key === lastApplied) {
    if (pending) void pump();
    return;
  }

  inFlight = true;
  try {
    await invoke("set_hit_regions", { rects: next.rects });
    lastApplied = next.key;
  } catch {
    // Rust retains the last known-good shape on failure. A later resize,
    // mutation, or explicit state change will naturally retry this payload.
  } finally {
    inFlight = false;
    if (pending) void pump();
  }
}

function sendNow() {
  frame = 0;
  const rects = measureHitRects();
  if (rects.length === 0) return;
  const key = keyFor(rects);
  if (key === lastApplied || key === pending?.key) return;
  pending = { key, rects };
  void pump();
}

/** Queue a coalesced region measurement on the next animation frame. */
export function publishHitRegions(): void {
  if (frame) return;
  frame = requestAnimationFrame(sendNow);
}

/**
 * Publish immediately and wait for the native shape. Startup uses this before
 * revealing the hidden WebView, ensuring no oversized click-blocking frame can
 * appear while the shell is becoming ready.
 */
export async function publishInitialHitRegions(): Promise<void> {
  const rects = measureHitRects();
  if (rects.length === 0) return;
  const key = keyFor(rects);
  try {
    await invoke("set_hit_regions", { rects });
    lastApplied = key;
  } catch {
    // Browser preview has no Tauri command. Rust has already seeded a safe
    // notch region in the real app, so startup can still continue.
  }
}

let watching = false;

/** Keep the native region synchronized with visible surfaces. */
export function watchHitRegions(root: HTMLElement): () => void {
  if (watching) return () => {};
  watching = true;

  const ro = new ResizeObserver(() => publishHitRegions());
  ro.observe(root);
  for (const el of root.querySelectorAll<HTMLElement>("[data-islet-hit]")) {
    ro.observe(el);
  }

  const mo = new MutationObserver(() => {
    for (const el of root.querySelectorAll<HTMLElement>("[data-islet-hit]")) {
      ro.observe(el);
    }
    publishHitRegions();
  });
  mo.observe(root, { childList: true, subtree: true });

  const onMotionEnd = () => publishHitRegions();
  root.addEventListener("transitionend", onMotionEnd);
  root.addEventListener("animationend", onMotionEnd);

  publishHitRegions();

  return () => {
    watching = false;
    ro.disconnect();
    mo.disconnect();
    root.removeEventListener("transitionend", onMotionEnd);
    root.removeEventListener("animationend", onMotionEnd);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
  };
}
