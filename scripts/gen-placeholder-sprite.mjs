// Generates the ORIGINAL sprite atlas for the built-in character "Pip".
//
// Pip is our own geometric mascot: a rounded-square body with big eyes and
// little nub arms/feet. It is NOT based on any existing character (AGENTS.md:
// never a copyrighted character; the pack is CC0 data only).
//
// WHY a hand-written renderer + PNG encoder: we only need flat RGBA frames, and
// pulling a full image/canvas library into a build script for a one-off asset
// is not worth the dependency. Node's zlib does the compression.
//
// WHY supersampling: the first version stamped raw pixels, so every edge was
// hard-aliased and the mascot looked like jagged blobs at notch size. Every
// shape is now drawn at SS x resolution and box-filtered down, which is what
// gives the art smooth edges and lets us use soft shading at all.
//
// Usage: node scripts/gen-placeholder-sprite.mjs <packDir>

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const FRAME = 48;
const COLS = 8;
const ROWS = 6; // idle / working / celebrating / sleeping / sad / curious
const W = FRAME * COLS;
const H = FRAME * ROWS;

/** Supersample factor. 4x4 = 16 samples per output pixel. */
const SS = 4;
const SW = W * SS;
const SH = H * SS;

// ---- Palette. Single accent family, matching src/ui/tokens.css. ----
const BODY_TOP = [0x7a, 0xb0, 0xf8, 255];
const BODY_BOT = [0x2f, 0x6f, 0xd0, 255];
const BODY_EDGE = [0x1e, 0x4e, 0x9c, 255];
const EYE_WHITE = [0xf7, 0xfa, 0xff, 255];
const PUPIL = [0x12, 0x1a, 0x2b, 255];
const GLINT = [255, 255, 255, 235];
const MOUTH = [0x14, 0x1d, 0x30, 255];
const BLUSH = [0xff, 0x92, 0x9b, 110];
const SHEEN = [255, 255, 255, 46];

// Supersampled RGBA buffer.
const buf = new Uint8ClampedArray(SW * SH * 4);

/** Alpha-blend one supersample pixel. */
function blend(x, y, c) {
  if (x < 0 || y < 0 || x >= SW || y >= SH) return;
  const i = (y * SW + x) * 4;
  const a = c[3] / 255;
  if (a >= 1) {
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = 255;
    return;
  }
  const ia = 1 - a;
  buf[i] = c[0] * a + buf[i] * ia;
  buf[i + 1] = c[1] * a + buf[i + 1] * ia;
  buf[i + 2] = c[2] * a + buf[i + 2] * ia;
  buf[i + 3] = Math.max(buf[i + 3], c[3]);
}

const lerp = (a, b, t) => a + (b - a) * t;
function mixColor(c0, c1, t) {
  return [
    lerp(c0[0], c1[0], t),
    lerp(c0[1], c1[1], t),
    lerp(c0[2], c1[2], t),
    lerp(c0[3], c1[3], t),
  ];
}

/**
 * Filled rounded rectangle in FRAME-local units, with an optional vertical
 * gradient. Coordinates are output-pixel space; scaling to SS happens here.
 */
function roundRect(ox, oy, x, y, w, h, r, cTop, cBot = cTop) {
  const X = (ox + x) * SS;
  const Y = (oy + y) * SS;
  const WW = w * SS;
  const HH = h * SS;
  const R = Math.min(r * SS, Math.min(WW, HH) / 2);
  for (let py = 0; py < HH; py++) {
    const t = HH <= 1 ? 0 : py / (HH - 1);
    const col = mixColor(cTop, cBot, t);
    for (let px = 0; px < WW; px++) {
      // Corner test: only the rounded corners need a radius check.
      const dx = px < R ? R - px : px > WW - R - 1 ? px - (WW - R - 1) : 0;
      const dy = py < R ? R - py : py > HH - R - 1 ? py - (HH - R - 1) : 0;
      if (dx > 0 && dy > 0 && dx * dx + dy * dy > R * R) continue;
      blend(X + px, Y + py, col);
    }
  }
}

/** Filled ellipse in FRAME-local units. */
function ellipse(ox, oy, cx, cy, rx, ry, c) {
  const CX = (ox + cx) * SS;
  const CY = (oy + cy) * SS;
  const RX = rx * SS;
  const RY = ry * SS;
  for (let py = Math.floor(CY - RY); py <= Math.ceil(CY + RY); py++) {
    for (let px = Math.floor(CX - RX); px <= Math.ceil(CX + RX); px++) {
      const nx = (px - CX) / RX;
      const ny = (py - CY) / RY;
      if (nx * nx + ny * ny <= 1) blend(px, py, c);
    }
  }
}

/** Stroked arc, stamped as overlapping dots so joins stay smooth. */
function arc(ox, oy, cx, cy, r, a0, a1, thick, c) {
  const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r * SS));
  const rad = (thick * SS) / 2;
  for (let s = 0; s <= steps; s++) {
    const a = a0 + ((a1 - a0) * s) / steps;
    const px = (ox + cx + Math.cos(a) * r) * SS;
    const py = (oy + cy + Math.sin(a) * r) * SS;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy <= rad * rad) {
          blend(Math.round(px + dx), Math.round(py + dy), c);
        }
      }
    }
  }
}

/**
 * Draw one Pip frame.
 *
 * `pose` fields: bob (vertical offset), blink, sleep, look (pupil x shift),
 * mouth ("smile" | "open" | "frown" | "flat"), armsUp, blush, tilt, sparkle.
 */
function drawPip(col, row, pose = {}) {
  const ox = col * FRAME;
  const oy = row * FRAME;
  const bob = pose.bob ?? 0;
  const tilt = pose.tilt ?? 0;

  const bodyW = 30;
  const bodyH = 29;
  const bx = (FRAME - bodyW) / 2 + tilt;
  const by = 9 + bob;
  const cx = FRAME / 2 + tilt;

  // Feet first so the body overlaps them.
  ellipse(ox, oy, cx - 7, by + bodyH + 1.5, 4, 2.6, BODY_BOT);
  ellipse(ox, oy, cx + 7, by + bodyH + 1.5, 4, 2.6, BODY_BOT);

  // Arms: little nubs. Raised when celebrating.
  if (pose.armsUp) {
    // Keep raised arms BESIDE the body, not above its top edge: any higher and
    // the nubs clear the silhouette and read as horns instead of arms.
    ellipse(ox, oy, bx - 3.5, by + 9, 2.8, 5.5, BODY_BOT);
    ellipse(ox, oy, bx + bodyW + 3.5, by + 9, 2.8, 5.5, BODY_BOT);
  } else {
    ellipse(ox, oy, bx - 2.5, by + 15, 3, 5, BODY_BOT);
    ellipse(ox, oy, bx + bodyW + 2.5, by + 15, 3, 5, BODY_BOT);
  }

  // Body: soft outline, then the gradient face plate on top.
  roundRect(ox, oy, bx - 1, by - 1, bodyW + 2, bodyH + 2, 10, BODY_EDGE);
  roundRect(ox, oy, bx, by, bodyW, bodyH, 9, BODY_TOP, BODY_BOT);
  // Top sheen so the body reads as lit from above rather than flat.
  roundRect(ox, oy, bx + 2.5, by + 2, bodyW - 5, 9, 5, SHEEN);

  // Eyes.
  const eyeY = by + 11;
  const eyeDX = 6.5;
  const look = pose.look ?? 0;
  if (pose.sleep) {
    arc(ox, oy, cx - eyeDX, eyeY, 3.2, Math.PI * 0.15, Math.PI * 0.85, 1.6, PUPIL);
    arc(ox, oy, cx + eyeDX, eyeY, 3.2, Math.PI * 0.15, Math.PI * 0.85, 1.6, PUPIL);
  } else if (pose.blink) {
    arc(ox, oy, cx - eyeDX, eyeY, 3.2, Math.PI * 0.1, Math.PI * 0.9, 1.7, PUPIL);
    arc(ox, oy, cx + eyeDX, eyeY, 3.2, Math.PI * 0.1, Math.PI * 0.9, 1.7, PUPIL);
  } else {
    const eyeR = pose.wide ? 5.2 : 4.6;
    ellipse(ox, oy, cx - eyeDX, eyeY, eyeR, eyeR + 0.4, EYE_WHITE);
    ellipse(ox, oy, cx + eyeDX, eyeY, eyeR, eyeR + 0.4, EYE_WHITE);
    const pr = pose.wide ? 2.5 : 2.2;
    ellipse(ox, oy, cx - eyeDX + look, eyeY + (pose.lookDown ?? 0), pr, pr, PUPIL);
    ellipse(ox, oy, cx + eyeDX + look, eyeY + (pose.lookDown ?? 0), pr, pr, PUPIL);
    // Specular glint: the single detail that makes the eyes feel alive.
    ellipse(ox, oy, cx - eyeDX + look - 0.9, eyeY - 1.4, 0.9, 0.9, GLINT);
    ellipse(ox, oy, cx + eyeDX + look - 0.9, eyeY - 1.4, 0.9, 0.9, GLINT);
  }

  if (pose.blush) {
    ellipse(ox, oy, cx - 11, eyeY + 5.5, 3.2, 2, BLUSH);
    ellipse(ox, oy, cx + 11, eyeY + 5.5, 3.2, 2, BLUSH);
  }

  // Mouth.
  const my = by + 21;
  switch (pose.mouth ?? "smile") {
    case "open":
      ellipse(ox, oy, cx, my + 0.5, 3.4, 3.2, MOUTH);
      ellipse(ox, oy, cx, my + 1.8, 2.2, 1.6, [0xff, 0x9f, 0xb0, 255]);
      break;
    case "frown":
      arc(ox, oy, cx, my + 3.4, 3.2, Math.PI * 1.15, Math.PI * 1.85, 1.5, MOUTH);
      break;
    case "flat":
      arc(ox, oy, cx, my, 0.1, 0, Math.PI * 2, 1.5, MOUTH);
      ellipse(ox, oy, cx, my, 2.6, 0.75, MOUTH);
      break;
    default: // smile
      arc(ox, oy, cx, my - 1.2, 3.1, Math.PI * 0.18, Math.PI * 0.82, 1.5, MOUTH);
  }

  // Celebration sparkles.
  if (pose.sparkle) {
    const s = [0xff, 0xd9, 0x6b, 240];
    ellipse(ox, oy, 8, by + 3, 1.5, 1.5, s);
    ellipse(ox, oy, FRAME - 8, by + 6, 1.2, 1.2, s);
    ellipse(ox, oy, 11, by + 14, 1, 1, s);
  }

  // Sleep "z"s.
  if (pose.sleep) {
    const z = [0xd7, 0xe4, 0xff, 225];
    ellipse(ox, oy, FRAME - 10, by + 2 + (pose.zOff ?? 0), 1.3, 1.3, z);
    ellipse(ox, oy, FRAME - 6, by - 3 + (pose.zOff ?? 0), 1, 1, z);
  }
}

/** Place a frame by its manifest index. */
function frame(index, pose) {
  drawPip(index % COLS, Math.floor(index / COLS), pose);
}

// ---- The frames the manifest references ----
// idle 0-3: slow breathe with one blink
frame(0, { bob: 0 });
frame(1, { bob: -1 });
frame(2, { bob: -1, blink: true });
frame(3, { bob: 0.5 });
// working 8-11: eyes down, focused, small busy bob
frame(8, { bob: 0, lookDown: 1.4, look: 0, mouth: "flat" });
frame(9, { bob: -1, lookDown: 1.4, look: 1, mouth: "flat" });
frame(10, { bob: 0, lookDown: 1.6, look: 0, mouth: "flat" });
frame(11, { bob: -1, lookDown: 1.4, look: -1, mouth: "flat" });
// celebrating 16-19: arms up, open mouth, blush, sparkles
frame(16, { bob: -2, armsUp: true, mouth: "open", blush: true, sparkle: true });
frame(17, { bob: -4, armsUp: true, mouth: "open", blush: true, sparkle: true, wide: true });
frame(18, { bob: -2, armsUp: true, mouth: "open", blush: true, sparkle: true });
frame(19, { bob: -4.5, armsUp: true, mouth: "open", blush: true, sparkle: true, wide: true });
// sleeping 24-25
frame(24, { bob: 1.5, sleep: true, mouth: "flat", zOff: 0 });
frame(25, { bob: 2.5, sleep: true, mouth: "flat", zOff: -2 });
// sad 32-34: droopy, frowning
frame(32, { bob: 1.5, mouth: "frown", lookDown: 1.2 });
frame(33, { bob: 2, mouth: "frown", blink: true });
frame(34, { bob: 1.5, mouth: "frown", lookDown: 1.6 });
// curious 40-42: head tilt, wide eyes, looking around
frame(40, { bob: 0, tilt: 1.5, wide: true, look: 1.6, mouth: "smile" });
frame(41, { bob: -1, tilt: -1.5, wide: true, look: -1.6, mouth: "smile" });
frame(42, { bob: 0, tilt: 1.5, wide: true, blink: true, mouth: "smile" });

// ---- Downsample SS x SS -> one output pixel (box filter) ----
const px = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let r = 0,
      g = 0,
      b = 0,
      a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * SW + (x * SS + sx)) * 4;
        const al = buf[i + 3] / 255;
        // Weight colour by alpha so transparent samples do not darken edges.
        r += buf[i] * al;
        g += buf[i + 1] * al;
        b += buf[i + 2] * al;
        a += al;
      }
    }
    const o = (y * W + x) * 4;
    if (a > 0) {
      px[o] = r / a;
      px[o + 1] = g / a;
      px[o + 2] = b / a;
      px[o + 3] = (a / (SS * SS)) * 255;
    }
  }
}

// ---- Encode RGBA buffer as PNG ----
function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA

const stride = W * 4;
const raw = Buffer.alloc((stride + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (stride + 1)] = 0; // filter: none
  Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const packDir = process.argv[2];
if (!packDir) {
  console.error("usage: node scripts/gen-placeholder-sprite.mjs <packDir>");
  process.exit(1);
}
const out = join(packDir, "sheet.png");
writeFileSync(out, png);
console.log(
  `wrote ${out} (${png.length} bytes, ${W}x${H}, ${COLS}x${ROWS} grid of ${FRAME}px, ${SS}x supersampled)`
);
