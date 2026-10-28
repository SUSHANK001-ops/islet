import { invoke } from "@tauri-apps/api/core";

/**
 * Publishes the rectangles of everything VISIBLE to Rust, which reshapes the
 * OS window to match (see src-tauri/src/window/hit_region.rs).
 *
 * WHY this exists: the island is ONE fixed 640x720 transparent window, but what
 * you can see is usually a small notch. Without a region, that whole invisible
 * rectangle swallows clicks and hover at the top of the screen, so the desktop
 * and other apps underneath stop responding. CSS `pointer-events: none` cannot
 * fix this - it only affects hit testing INSIDE the webview; WebView2 still
 * consumes the OS mouse message.
 *
 * Mark an interactive surface by putting `data-islet-hit` on it. The optional
 * value is the padding in px used to cover that element's CSS shadow/glow,
 * because the window region clips PAINTING as well as hit testing.
 */

export interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  pad: number;
}

/** Default shadow allowance when an element does not specify one. */
const DEFAULT_PAD = 12;

/** Largest corner radius we bother reading, as a sanity clamp on `999px`. */
const MAX_RADIUS = 48;

function readPad(el: HTMLElement): number {
  const raw = el.dataset.isletHit;
  if (!raw) return DEFAULT_PAD;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_PAD;
}

/**
 * Corner radius in px. `border-radius` can be a percentage or a huge pill value,
 * so clamp it to half the smaller side - a region cannot be rounder than that.
 */
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
    // Skip anything collapsed or mid-animation at zero size; it would only
    // contribute an empty piece to the region.
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

// Last payload sent, so an unchanged layout costs nothing.
let lastSent = "";
let frame = 0;

function sendNow() {
  frame = 0;
  const rects = measureHitRects();
  // Never publish an empty set: Rust would ignore it anyway, and it usually
  // means we measured during a teardown frame.
  if (rects.length === 0) return;
  // Round to whole pixels before comparing; sub-pixel jitter during a spring
  // animation would otherwise fire an invoke on every single frame.
  const key = rects
    .map(
      (r) =>
        `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(
          r.h
        )},${Math.round(r.radius)},${r.pad}`
    )
    .join("|");
  if (key === lastSent) return;
  lastSent = key;
  void invoke("set_hit_regions", { rects }).catch(() => {
    // Outside Tauri (tests/preview) or the command is unavailable: the app is
    // still usable, just over-eager about clicks. Allow a later retry.
    lastSent = "";
  });
}

/**
 * Queue a publish on the next frame. Safe to call as often as you like; it
 * coalesces to one measurement per frame and skips identical layouts.
 */
export function publishHitRegions(): void {
  if (frame) return;
  frame = requestAnimationFrame(sendNow);
}

let watching = false;

/**
 * Start keeping the region in sync. Observes size and DOM changes on the root,
 * plus the transition/animation ends that the spring-open uses, so the region
 * settles on the panel's final size rather than its mid-animation size.
 *
 * Returns a teardown function.
 */
export function watchHitRegions(root: HTMLElement): () => void {
  if (watching) return () => {};
  watching = true;

  const ro = new ResizeObserver(() => publishHitRegions());
  ro.observe(root);
  // Observe each marked surface too: the panel grows as a tab's content loads,
  // and watching only the root misses that.
  for (const el of root.querySelectorAll<HTMLElement>("[data-islet-hit]")) {
    ro.observe(el);
  }

  // Surfaces mount and unmount (panel, flyouts, toasts). Re-observe on change.
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
  };
}
