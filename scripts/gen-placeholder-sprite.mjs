// Generates the original block-built mascot "Pip" as character-pack data.
// The design uses a voxel-like visual language but does not copy a Minecraft
// character, texture, model, palette, or asset. No runtime code changes are
// needed to replace it because characters remain images + JSON.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const FRAME = 48;
const COLS = 8;
const ROWS = 6;
const W = FRAME * COLS;
const H = FRAME * ROWS;
const px = new Uint8Array(W * H * 4);

const C = {
  shadow: [0x00, 0x00, 0x00, 70],
  outline: [0x18, 0x1b, 0x19, 255],
  skin: [0xd9, 0xa4, 0x5b, 255],
  skinLight: [0xf0, 0xc9, 0x7c, 255],
  skinShade: [0xa9, 0x70, 0x38, 255],
  moss: [0x65, 0x8b, 0x58, 255],
  mossLight: [0x89, 0xad, 0x72, 255],
  jacket: [0x3f, 0x78, 0x70, 255],
  jacketLight: [0x61, 0xa1, 0x94, 255],
  cream: [0xf5, 0xed, 0xd5, 255],
  eye: [0x20, 0x25, 0x22, 255],
  cheek: [0xcf, 0x6d, 0x54, 255],
  gold: [0xef, 0xc7, 0x5e, 255],
  paper: [0xdb, 0xe4, 0xd8, 255],
};

function blendPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const a = color[3] / 255;
  const under = px[i + 3] / 255;
  const out = a + under * (1 - a);
  if (out <= 0) return;
  px[i] = (color[0] * a + px[i] * under * (1 - a)) / out;
  px[i + 1] = (color[1] * a + px[i + 1] * under * (1 - a)) / out;
  px[i + 2] = (color[2] * a + px[i + 2] * under * (1 - a)) / out;
  px[i + 3] = out * 255;
}

function rect(ox, oy, x, y, w, h, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + h); py++) {
    for (let pxi = Math.floor(x); pxi < Math.ceil(x + w); pxi++) {
      blendPixel(ox + pxi, oy + py, color);
    }
  }
}

function checker(ox, oy, x, y, w, h, a, b) {
  for (let py = 0; py < h; py++) {
    for (let pxi = 0; pxi < w; pxi++) {
      blendPixel(ox + x + pxi, oy + y + py, (pxi + py) % 3 === 0 ? b : a);
    }
  }
}

function sparkle(ox, oy, x, y) {
  rect(ox, oy, x + 2, y, 2, 6, C.gold);
  rect(ox, oy, x, y + 2, 6, 2, C.gold);
}

/** Draw one original voxel desk buddy. All coordinates are whole pixels. */
function drawPip(index, pose = {}) {
  const ox = (index % COLS) * FRAME;
  const oy = Math.floor(index / COLS) * FRAME;
  const bob = pose.bob ?? 0;
  const lean = pose.lean ?? 0;
  const jump = Math.max(0, -bob);
  const x = 15 + lean;
  const y = 6 + bob;

  // Ground contact contracts while Pip jumps.
  rect(ox, oy, 16 + jump, 43, 16 - jump * 2, 2, C.shadow);

  // Block legs and boots.
  rect(ox, oy, x + 2, y + 29, 6, 9, C.outline);
  rect(ox, oy, x + 12, y + 29, 6, 9, C.outline);
  rect(ox, oy, x + 3, y + 29, 4, 7, C.jacket);
  rect(ox, oy, x + 13, y + 29, 4, 7, C.jacket);
  rect(ox, oy, x, y + 36, 9, 4, C.outline);
  rect(ox, oy, x + 11, y + 36, 9, 4, C.outline);

  // Arms change silhouette by state.
  if (pose.armsUp) {
    rect(ox, oy, x - 5, y + 14, 5, 13, C.outline);
    rect(ox, oy, x + 20, y + 14, 5, 13, C.outline);
    rect(ox, oy, x - 4, y + 15, 3, 10, C.jacketLight);
    rect(ox, oy, x + 21, y + 15, 3, 10, C.jacketLight);
    rect(ox, oy, x - 4, y + 10, 4, 5, C.skin);
    rect(ox, oy, x + 20, y + 10, 4, 5, C.skin);
  } else {
    rect(ox, oy, x - 5, y + 23, 5, 12, C.outline);
    rect(ox, oy, x + 20, y + 23, 5, 12, C.outline);
    rect(ox, oy, x - 4, y + 24, 3, 9, C.jacket);
    rect(ox, oy, x + 21, y + 24, 3, 9, C.jacket);
  }

  // Torso with a small utility-pocket detail.
  rect(ox, oy, x, y + 19, 20, 16, C.outline);
  rect(ox, oy, x + 1, y + 20, 18, 14, C.jacket);
  rect(ox, oy, x + 2, y + 20, 16, 3, C.jacketLight);
  rect(ox, oy, x + 7, y + 27, 6, 5, C.outline);
  rect(ox, oy, x + 8, y + 28, 4, 3, C.mossLight);

  // Cubic head. The offset highlight gives it volume without gradients.
  rect(ox, oy, x - 1, y - 1, 22, 22, C.outline);
  rect(ox, oy, x, y, 20, 20, C.skin);
  rect(ox, oy, x + 1, y + 1, 18, 4, C.skinLight);
  rect(ox, oy, x + 17, y + 5, 3, 15, C.skinShade);

  // Mossy cap uses an irregular block pattern unique to Pip.
  rect(ox, oy, x, y, 20, 4, C.moss);
  rect(ox, oy, x + 2, y - 2, 6, 3, C.mossLight);
  rect(ox, oy, x + 11, y - 1, 7, 3, C.moss);
  rect(ox, oy, x + 1, y + 4, 3, 3, C.moss);

  const eyeY = y + 9;
  if (pose.sleep || pose.blink) {
    rect(ox, oy, x + 4, eyeY + 2, 4, 1, C.eye);
    rect(ox, oy, x + 13, eyeY + 2, 4, 1, C.eye);
  } else {
    rect(ox, oy, x + 3, eyeY, 6, 5, C.cream);
    rect(ox, oy, x + 12, eyeY, 6, 5, C.cream);
    const look = pose.look ?? 0;
    const down = pose.lookDown ? 1 : 0;
    rect(ox, oy, x + 5 + look, eyeY + 1 + down, 2, 3, C.eye);
    rect(ox, oy, x + 14 + look, eyeY + 1 + down, 2, 3, C.eye);
  }

  if (pose.blush) {
    rect(ox, oy, x + 1, y + 15, 3, 2, C.cheek);
    rect(ox, oy, x + 17, y + 15, 2, 2, C.cheek);
  }

  const mouthY = y + 16;
  if (pose.mouth === "open") {
    rect(ox, oy, x + 8, mouthY, 5, 3, C.eye);
    rect(ox, oy, x + 9, mouthY + 2, 3, 1, C.cheek);
  } else if (pose.mouth === "frown") {
    rect(ox, oy, x + 8, mouthY + 1, 5, 1, C.eye);
    rect(ox, oy, x + 8, mouthY, 1, 1, C.eye);
    rect(ox, oy, x + 12, mouthY, 1, 1, C.eye);
  } else if (pose.mouth === "flat") {
    rect(ox, oy, x + 9, mouthY, 3, 1, C.eye);
  } else {
    rect(ox, oy, x + 8, mouthY, 5, 1, C.eye);
    rect(ox, oy, x + 9, mouthY + 1, 3, 1, C.eye);
  }

  if (pose.working) {
    checker(ox, oy, x + 4, y + 25, 12, 7, C.paper, C.cream);
    rect(ox, oy, x + 4, y + 25, 12, 1, C.outline);
  }
  if (pose.sparkle) {
    sparkle(ox, oy, 5, 7 + (index % 2) * 3);
    sparkle(ox, oy, 37, 12 - (index % 2) * 3);
  }
  if (pose.sleep) {
    rect(ox, oy, x + 22, y + 5, 4, 1, C.paper);
    rect(ox, oy, x + 25, y + 2, 1, 4, C.paper);
    rect(ox, oy, x + 27, y, 4, 1, C.paper);
  }
}

// idle 0-3: slow step-breathe and a blink
[{}, { bob: -1 }, { bob: -1, blink: true }, {}].forEach((p, i) => drawPip(i, p));
// working 8-11: reads a small paper/map and scans it
[-1, 0, 1, 0].forEach((look, i) =>
  drawPip(8 + i, { working: true, look, lookDown: true, mouth: "flat", bob: i % 2 ? -1 : 0 })
);
// celebrating 16-19: two-frame jump rhythm with raised arms
[0, -4, -1, -5].forEach((bob, i) =>
  drawPip(16 + i, { bob, armsUp: true, mouth: "open", blush: true, sparkle: true })
);
// sleeping 24-25
[1, 2].forEach((bob, i) => drawPip(24 + i, { bob, sleep: true, mouth: "flat" }));
// sad 32-34
[1, 2, 1].forEach((bob, i) => drawPip(32 + i, { bob, mouth: "frown", blink: i === 1 }));
// curious 40-42
[1, -1, 1].forEach((lean, i) =>
  drawPip(40 + i, { lean, look: lean, blink: i === 2, bob: i === 1 ? -1 : 0 })
);

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
ihdr[8] = 8;
ihdr[9] = 6;
const stride = W * 4;
const raw = Buffer.alloc((stride + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (stride + 1)] = 0;
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
console.log(`wrote ${out} (${png.length} bytes, ${COLS}x${ROWS} block-built atlas)`);
