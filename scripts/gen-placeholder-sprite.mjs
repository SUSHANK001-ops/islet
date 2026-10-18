// Generates an ORIGINAL placeholder sprite atlas for the built-in character.
// This is our own geometric mascot ("Pip"): a rounded blob with eyes and a
// little bounce/blink. It is NOT based on any existing character. Output is a
// 48x48-per-frame, 8-column PNG matching the manifest grid.
//
// Why a hand-written PNG encoder: we only need flat RGBA frames, and pulling a
// full image library for a one-off build script is overkill. ~60 lines of
// zlib + CRC does the job (Node has zlib built in).
//
// Usage: node scripts/gen-placeholder-sprite.mjs <packDir>

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const FRAME = 48;
const COLS = 8;
const ROWS = 6; // rows 0..5 used by the manifest (idle/working/celebrate/sleep/sad/curious)
const W = FRAME * COLS;
const H = FRAME * ROWS;

// Palette (original colors, Islet-ish). RGBA.
const BODY = [124, 156, 255, 255]; // accent blue
const BODY_DK = [92, 120, 210, 255];
const EYE = [16, 16, 28, 255];
const EYE_W = [244, 244, 246, 255];
const MOUTH = [167, 139, 250, 255]; // accent-2
const CLEAR = [0, 0, 0, 0];

const px = new Uint8Array(W * H * 4); // RGBA buffer, transparent

function set(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
}

// Draw a filled circle (cx,cy radius r) in frame-local coords offset by (ox,oy).
function disc(ox, oy, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) set(ox + cx + x, oy + cy + y, c);
    }
  }
}

function rr(ox, oy, x0, y0, w, h, c) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(ox + x0 + x, oy + y0 + y, c);
}

// Draw one frame of the mascot. `pose` tweaks eyes/mouth/offset per state.
function drawMascot(col, row, pose) {
  const ox = col * FRAME;
  const oy = row * FRAME;
  const bob = pose.bob || 0;
  const cx = 24;
  const cy = 26 + bob;

  // Body: a rounded blob (big disc + rounded base).
  disc(ox, oy, cx, cy, 15, BODY);
  rr(ox, oy, cx - 15, cy, 31, 10, BODY);
  disc(ox, oy, cx - 15, cy + 9, 5, BODY);
  disc(ox, oy, cx + 15, cy + 9, 5, BODY);
  // Shade along the bottom.
  rr(ox, oy, cx - 13, cy + 11, 27, 3, BODY_DK);

  if (pose.sleep) {
    // Closed eyes (two short dark lines) + small "z".
    rr(ox, oy, cx - 9, cy - 3, 6, 2, EYE);
    rr(ox, oy, cx + 4, cy - 3, 6, 2, EYE);
  } else {
    // Eye whites + pupils; blink shrinks the white.
    const eyeH = pose.blink ? 2 : 7;
    const eyeY = cy - 6;
    rr(ox, oy, cx - 10, eyeY, 7, eyeH, EYE_W);
    rr(ox, oy, cx + 4, eyeY, 7, eyeH, EYE_W);
    if (!pose.blink) {
      const look = pose.look || 0;
      disc(ox, oy, cx - 6 + look, eyeY + 3, 2, EYE);
      disc(ox, oy, cx + 8 + look, eyeY + 3, 2, EYE);
    }
  }

  // Mouth per mood.
  const my = cy + 4;
  if (pose.celebrate) {
    disc(ox, oy, cx, my, 4, MOUTH); // open happy
  } else if (pose.sad) {
    rr(ox, oy, cx - 4, my + 2, 8, 2, MOUTH); // flat/down
  } else {
    rr(ox, oy, cx - 4, my, 8, 2, MOUTH); // small smile line
  }
}

// Build the frames the manifest references:
// idle 0-3, working 8-11, celebrating 16-19, sleeping 24-25, sad 32-34, curious 40-42
function frame(index, pose) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  drawMascot(col, row, pose);
}

// idle: gentle blink cycle + bob
frame(0, { bob: 0 });
frame(1, { bob: -1 });
frame(2, { bob: 0, blink: true });
frame(3, { bob: 1 });
// working: looking down, small bob
frame(8, { bob: 0, look: 1 });
frame(9, { bob: 1, look: 1 });
frame(10, { bob: 0, look: 2 });
frame(11, { bob: 1, look: 1 });
// celebrating: open mouth, up bob
frame(16, { bob: -2, celebrate: true });
frame(17, { bob: -3, celebrate: true });
frame(18, { bob: -2, celebrate: true });
frame(19, { bob: -3, celebrate: true });
// sleeping
frame(24, { bob: 1, sleep: true });
frame(25, { bob: 2, sleep: true });
// sad
frame(32, { bob: 1, sad: true });
frame(33, { bob: 2, sad: true, blink: true });
frame(34, { bob: 1, sad: true });
// curious
frame(40, { bob: 0, look: 2 });
frame(41, { bob: -1, look: -1 });
frame(42, { bob: 0, look: 2, blink: true });

// ---- Encode RGBA buffer as PNG ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "latin1");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
// Add a filter byte (0) at the start of each scanline.
const stride = W * 4;
const raw = Buffer.alloc((stride + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (stride + 1)] = 0;
  Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
}
const idat = deflateSync(raw, { level: 9 });
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const packDir = process.argv[2];
if (!packDir) {
  console.error("usage: node scripts/gen-placeholder-sprite.mjs <packDir>");
  process.exit(1);
}
const out = join(packDir, "sheet.png");
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes, ${W}x${H}, ${COLS}x${ROWS} grid of ${FRAME}px)`);
