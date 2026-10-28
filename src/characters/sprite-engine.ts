import type { LoadedCharacter, StateSpec } from "./bridge";

// The sprite engine: decode a sheet ONCE into an ImageBitmap and draw frames to
// a canvas. It knows nothing about Preact, the hub, or moods - it just plays a
// named state at the right fps on the canvas it is given.
//
// Performance rules it enforces (AGENTS.md):
// - Decode the sheet exactly once; the same bitmap serves notch AND panel.
// - Redraw only when the frame actually changes (not every rAF tick).
// - Cap fps: notch <= 6, panel idle <= 8, panel active <= pack fps (<= 24).
// - Stop the rAF loop entirely on stop() - no idle ticking.
// - Free the bitmap on dispose() so switching characters leaks nothing.

/** Hard fps caps per surface (AGENTS.md animation rates). */
export const FPS_CAP = {
  notch: 6,
  panelIdle: 8,
  panelActive: 24,
} as const;

export type Surface = "notch" | "panel";

/**
 * Decode a character's main sheet into an ImageBitmap. One decode per load; the
 * caller shares the returned bitmap between the notch and panel engines.
 */
export async function decodeSheet(url: string): Promise<ImageBitmap> {
  // WHY an <img> and not fetch(): fetch() is governed by the CSP's connect-src,
  // which falls back to `default-src 'self'` in tauri.conf.json. The sheet lives
  // at http://asset.localhost/... which is NOT 'self', so fetch() is blocked and
  // the character silently never appears. That origin IS allowed under img-src,
  // so an image element loads it. Do not switch this back to fetch() without
  // also widening connect-src.
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  // decode() rejects on a bad/missing file, which the caller turns into a
  // visible "character unavailable" state rather than a blank canvas.
  await img.decode();
  // Scaling is done at draw time with imageSmoothing set from the pack's
  // pixelArt flag, so no resizing happens here.
  return createImageBitmap(img);
}

export class SpriteEngine {
  private ctx: CanvasRenderingContext2D;
  private bitmap: ImageBitmap;
  private manifest: LoadedCharacter["manifest"];
  private surface: Surface;

  private stateName = "idle";
  private state: StateSpec;
  private frameIdx = 0;
  private lastDrawn = -1;
  private accum = 0;
  private lastTs = 0;
  private rafId = 0;
  private running = false;
  // Frame-rate multiplier (<=1). Lets the gate slow animation down instead of
  // stopping it outright, e.g. while the machine runs on battery.
  private rateScale = 1;
  // Device-pixel scale so the canvas is crisp on HiDPI without reflowing CSS.
  private dpr = 1;

  constructor(
    canvas: HTMLCanvasElement,
    char: LoadedCharacter,
    bitmap: ImageBitmap,
    surface: Surface
  ) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.bitmap = bitmap;
    this.manifest = char.manifest;
    this.surface = surface;
    this.state = this.resolve("idle");
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.sizeCanvas(canvas);
    // Pixel art: keep edges hard. Smooth art: let the browser interpolate.
    this.ctx.imageSmoothingEnabled = !this.manifest.sheet.pixelArt;
  }

  /** Size the backing store to the CSS box times DPR for a crisp draw. */
  private sizeCanvas(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * this.dpr));
    const h = Math.max(1, Math.round(rect.height * this.dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  private resolve(name: string): StateSpec {
    return this.manifest.states[name] ?? this.manifest.states["idle"];
  }

  /**
   * Effective fps for this surface: the pack's rate, clamped by the surface cap,
   * then scaled down by `rateScale` (used to slow animation on battery).
   * Never below 1 fps, so a scaled-down state still moves.
   */
  private fpsFor(state: StateSpec): number {
    const cap =
      this.surface === "notch"
        ? FPS_CAP.notch
        : this.stateName === "idle"
          ? FPS_CAP.panelIdle
          : FPS_CAP.panelActive;
    const capped = Math.min(state.fps, cap);
    return Math.max(1, capped * this.rateScale);
  }

  /**
   * Scale the frame rate (1 = full, 0.5 = half). Applied on top of the surface
   * cap so the budget can never be exceeded, only undercut.
   */
  setRateScale(scale: number) {
    this.rateScale = Math.max(0.05, Math.min(1, scale));
  }

  /** Switch to a new state (resets the frame cursor if it actually changed). */
  setState(name: string) {
    if (name === this.stateName) return;
    this.stateName = name;
    this.state = this.resolve(name);
    this.frameIdx = 0;
    this.accum = 0;
    this.lastDrawn = -1; // force a redraw of the first frame
  }

  /** Start the animation loop. Safe to call repeatedly. */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTs = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  /** Stop the loop completely. No ticking while stopped (closed == cheap). */
  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /** Draw exactly one frame right now (used for a static, non-animating draw). */
  drawStatic() {
    this.drawFrame(this.state.frames[this.frameIdx] ?? 0);
  }

  private tick = (ts: number) => {
    if (!this.running) return;
    if (this.lastTs === 0) this.lastTs = ts;
    const dt = ts - this.lastTs;
    this.lastTs = ts;

    const fps = this.fpsFor(this.state);
    const frameDur = 1000 / fps;
    this.accum += dt;

    // Advance only when enough time has elapsed for the next frame. This keeps
    // the effective draw rate at the capped fps even though rAF runs at 60.
    if (this.accum >= frameDur) {
      this.accum %= frameDur;
      const count = this.state.frames.length;
      if (this.state.loop) {
        this.frameIdx = (this.frameIdx + 1) % count;
      } else if (this.frameIdx < count - 1) {
        this.frameIdx += 1;
      }
    }

    const frame = this.state.frames[this.frameIdx] ?? 0;
    if (frame !== this.lastDrawn) {
      this.drawFrame(frame);
      this.lastDrawn = frame;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  /** Draw one sheet frame centered + contained in the canvas box. */
  private drawFrame(frameIndex: number) {
    const { frameWidth: fw, frameHeight: fh, columns } = this.manifest.sheet;
    const sx = (frameIndex % columns) * fw;
    const sy = Math.floor(frameIndex / columns) * fh;

    const cw = this.ctx.canvas.width;
    const ch = this.ctx.canvas.height;
    this.ctx.clearRect(0, 0, cw, ch);

    // Contain the frame in the canvas with an integer scale for crisp pixels.
    const rawScale = Math.min(cw / fw, ch / fh);
    const scale = this.manifest.sheet.pixelArt
      ? Math.max(1, Math.floor(rawScale))
      : rawScale;
    const dw = fw * scale;
    const dh = fh * scale;
    const dx = Math.round((cw - dw) / 2);
    const dy = Math.round((ch - dh) / 2);

    this.ctx.drawImage(this.bitmap, sx, sy, fw, fh, dx, dy, dw, dh);
  }

  /** Current state name (for tests / debugging). */
  get currentState(): string {
    return this.stateName;
  }
}

/** Close an ImageBitmap if the browser supports it (frees GPU/CPU memory). */
export function freeBitmap(bitmap: ImageBitmap | null) {
  if (bitmap && typeof bitmap.close === "function") bitmap.close();
}
