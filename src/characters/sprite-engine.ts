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
  private canvasEl: HTMLCanvasElement;
  // Continuous smooth-float state (panel only). Amplitude is in FRAME pixels
  // (scaled at draw time); phase advances by bobSpeed rad/sec. Notch keeps
  // amplitude 0 so it stays strictly frame-stepped within the closed budget.
  private bobPhase = Math.random() * Math.PI * 2;
  private bobAmplitude = 0;
  private bobSpeed = 2.0;
  private floatAccum = 0;
  // The pill grows on hover/open, so the canvas CSS box changes size AFTER the
  // engine is built. A ResizeObserver keeps the backing store in sync and
  // forces a redraw; without it the frame was sized once and the newly exposed
  // area was never cleared (the "white flash" when the notch animated/grew).
  private resizeObs: ResizeObserver | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    char: LoadedCharacter,
    bitmap: ImageBitmap,
    surface: Surface
  ) {
    // Keep the alpha backing store explicit. The low animation rates do not
    // benefit from desynchronized presentation, which can expose transient
    // compositor surfaces on some WebView2/transparent-window combinations.
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.canvasEl = canvas;
    this.bitmap = bitmap;
    this.manifest = char.manifest;
    this.surface = surface;
    this.state = this.resolve("idle");
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.sizeCanvas(canvas);
    // Only the panel floats smoothly (its budget allows up to 24fps). The notch
    // must stay frame-stepped at <=6fps per the closed-CPU budget, so it gets no
    // continuous float (amplitude 0 => the tick never forces an extra redraw).
    this.bobAmplitude = surface === "panel" ? 1.4 : 0;
    // Pixel art: keep edges hard. Smooth art: let the browser interpolate.
    this.ctx.imageSmoothingEnabled = !this.manifest.sheet.pixelArt;

    // Re-size + redraw whenever the canvas box changes (pill hover/open grow,
    // DPI change). Guarded for environments without ResizeObserver (tests).
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver(() => this.handleResize());
      this.resizeObs.observe(canvas);
    }
  }

  /** Size the backing store to the CSS box times DPR for a crisp draw. */
  private sizeCanvas(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * this.dpr));
    const h = Math.max(1, Math.round(rect.height * this.dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    // Resizing a canvas resets its context state, so re-apply smoothing.
    this.ctx.imageSmoothingEnabled = !this.manifest.sheet.pixelArt;
  }

  /** CSS box changed: resync the backing store and repaint the current frame
   *  immediately so no stale/empty area is ever shown. */
  private handleResize() {
    const before = `${this.canvasEl.width}x${this.canvasEl.height}`;
    this.sizeCanvas(this.canvasEl);
    const after = `${this.canvasEl.width}x${this.canvasEl.height}`;
    // Only force a redraw if the backing store actually changed (avoids
    // redundant draws from sub-pixel observer callbacks).
    if (before !== after) {
      this.lastDrawn = -1;
      this.drawFrame(this.state.frames[this.frameIdx] ?? 0);
    }
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

  /** Full teardown: stop the loop AND drop the resize observer. Call when the
   *  engine is discarded (character/surface change) so no observer leaks. */
  dispose() {
    this.stop();
    this.resizeObs?.disconnect();
    this.resizeObs = null;
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
    // the sprite SWAP rate at the capped fps even though rAF runs at 60.
    let frameChanged = false;
    if (this.accum >= frameDur) {
      this.accum %= frameDur;
      const count = this.state.frames.length;
      if (this.state.loop) {
        this.frameIdx = (this.frameIdx + 1) % count;
      } else if (this.frameIdx < count - 1) {
        this.frameIdx += 1;
      }
      frameChanged = true;
    }

    // Smooth idle float: a gentle sub-pixel vertical bob driven by a continuous
    // phase, independent of the sprite-swap cap. This is what makes the panel
    // character feel alive and SMOOTH instead of a choppy few-frame swap. It is
    // THROTTLED to the panel-active cap (<=24fps) so it never exceeds the perf
    // budget, and only looping states float (one-shots keep authored motion).
    const wantsFloat = this.state.loop && this.bobAmplitude > 0;
    let floatTick = false;
    if (wantsFloat) {
      this.bobPhase += (dt / 1000) * this.bobSpeed;
      this.floatAccum += dt;
      const floatDur = 1000 / FPS_CAP.panelActive; // cap smooth draws at 24fps
      if (this.floatAccum >= floatDur) {
        this.floatAccum %= floatDur;
        floatTick = true;
      }
    }

    const frame = this.state.frames[this.frameIdx] ?? 0;
    // Redraw when the sprite frame changed OR when a throttled float tick is due
    // OR when the frame index moved. Static states draw once and then idle.
    if (frameChanged || floatTick || frame !== this.lastDrawn) {
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
    // Smooth vertical float, applied only on the panel (the notch stays strictly
    // frame-stepped to honor the closed-CPU budget). The sprite already encodes
    // a per-frame bob; this adds a continuous sub-pixel sine on top so the idle
    // breathing reads as fluid rather than a 4-frame step.
    const bob =
      this.state.loop && this.bobAmplitude > 0
        ? Math.sin(this.bobPhase) * this.bobAmplitude * scale
        : 0;
    const dy = Math.round((ch - dh) / 2 + bob);

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
