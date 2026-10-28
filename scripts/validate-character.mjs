// Validates a character pack folder the way the app will, BEFORE you ship it.
//
// Rust is the security boundary and the source of truth (see
// src-tauri/src/characters/validate.rs) - this script deliberately mirrors the
// same limits so a pack author gets the same answer at the command line.
// If the two ever disagree, Rust wins and this file is the bug.
//
// WHY hand-rolled instead of a JSON Schema library: the rules below are a few
// dozen range/shape checks plus two checks a schema cannot express at all (the
// PNG's real pixel size, and whether every frame index fits the sheet grid).
// Adding a validator dependency for that is not worth it (AGENTS.md: no new
// dependency we could write in ~100 lines).
//
// Usage:  node scripts/validate-character.mjs <packDir>
// Exits 0 when the pack is valid, 1 when it is not, 2 on bad usage.

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, isAbsolute } from "node:path";

// ---- Limits. Keep in step with characters/validate.rs + CHARACTERS.md. ----
const MANIFEST_VERSION = 1;
const REQUIRED_STATES = ["idle", "working", "celebrating", "sleeping", "sad"];
const ID_MIN = 3;
const ID_MAX = 40;
const MAX_FRAME_DIM = 128;
const MAX_FRAMES_PER_STATE = 64;
const FPS_MIN = 1;
const FPS_MAX = 24;
const MAX_STAGES = 4;
const MAX_OUTFITS = 30;
const MAX_SHEET_BYTES = 2 * 1024 * 1024;

const problems = [];
const fail = (msg) => problems.push(msg);

const packDir = process.argv[2];
if (!packDir) {
  console.error("usage: node scripts/validate-character.mjs <packDir>");
  process.exit(2);
}

// ---- Shared rules (mirrors is_valid_id / is_safe_rel_path in Rust) ----
const isValidId = (id) =>
  typeof id === "string" &&
  id.length >= ID_MIN &&
  id.length <= ID_MAX &&
  /^[a-z0-9-]+$/.test(id);

function isSafeRelPath(p) {
  if (typeof p !== "string" || p.length === 0 || p.length > 256) return false;
  if (p.includes("..") || p.includes("\\") || p.includes("://")) return false;
  if (p.startsWith("/") || isAbsolute(p)) return false;
  if (p.length >= 2 && p[1] === ":") return false; // drive letter
  return /^[A-Za-z0-9\-_./]+$/.test(p);
}

/** Read a PNG's real dimensions straight from the IHDR chunk. */
function pngSize(file) {
  const b = readFileSync(file);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v)) return null;
  if (b.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bytes: b.length };
}

// ---- Load the manifest ----
if (!existsSync(packDir) || !statSync(packDir).isDirectory()) {
  console.error(`not a directory: ${packDir}`);
  process.exit(2);
}

const manifestPath = join(packDir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`missing manifest.json in ${packDir}`);
  process.exit(1);
}

let m;
try {
  m = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (e) {
  console.error(`manifest.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

// ---- Top-level fields ----
if (m.schemaVersion !== MANIFEST_VERSION) {
  fail(`schemaVersion must be ${MANIFEST_VERSION}, got ${JSON.stringify(m.schemaVersion)}`);
}
if (!isValidId(m.id)) {
  fail("id must be 3-40 chars of lowercase letters, digits and hyphens");
}
for (const field of ["name", "author", "license"]) {
  if (typeof m[field] !== "string" || m[field].trim() === "") {
    fail(`${field} must not be empty`);
  }
}

// ---- Sheet ----
const sheet = m.sheet ?? {};
if (!isSafeRelPath(sheet.file)) fail("sheet.file is not a safe relative path");
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
if (!intIn(sheet.frameWidth, 1, MAX_FRAME_DIM)) {
  fail(`sheet.frameWidth must be 1..=${MAX_FRAME_DIM}`);
}
if (!intIn(sheet.frameHeight, 1, MAX_FRAME_DIM)) {
  fail(`sheet.frameHeight must be 1..=${MAX_FRAME_DIM}`);
}
if (!Number.isInteger(sheet.columns) || sheet.columns < 1) {
  fail("sheet.columns must be >= 1");
}
if (!intIn(sheet.scale, 1, 8)) fail("sheet.scale must be 1..=8");

// ---- The sheet image itself (things a schema cannot check) ----
let grid = null;
if (isSafeRelPath(sheet.file)) {
  const sheetPath = join(packDir, sheet.file);
  if (!existsSync(sheetPath)) {
    fail(`sheet.file not found: ${sheet.file}`);
  } else {
    const size = pngSize(sheetPath);
    if (!size) {
      fail(`${sheet.file} is not a valid PNG`);
    } else {
      if (size.bytes > MAX_SHEET_BYTES) {
        fail(
          `${sheet.file} is ${(size.bytes / 1024 / 1024).toFixed(2)} MB, over the ${
            MAX_SHEET_BYTES / 1024 / 1024
          } MB limit`
        );
      }
      if (intIn(sheet.frameWidth, 1, MAX_FRAME_DIM) && intIn(sheet.frameHeight, 1, MAX_FRAME_DIM)) {
        const cols = Math.floor(size.width / sheet.frameWidth);
        const rows = Math.floor(size.height / sheet.frameHeight);
        grid = { cols, rows, cells: cols * rows };
        if (cols < sheet.columns) {
          fail(
            `sheet.columns is ${sheet.columns} but ${sheet.file} is only ${size.width}px wide ` +
              `(fits ${cols} frames of ${sheet.frameWidth}px)`
          );
        }
        if (size.width % sheet.frameWidth !== 0 || size.height % sheet.frameHeight !== 0) {
          fail(
            `${sheet.file} is ${size.width}x${size.height}, not an exact multiple of ` +
              `${sheet.frameWidth}x${sheet.frameHeight}`
          );
        }
      }
    }
  }
}

// ---- States ----
const states = m.states ?? {};
for (const req of REQUIRED_STATES) {
  if (!(req in states)) fail(`missing required state: ${req}`);
}
for (const [name, st] of Object.entries(states)) {
  if (!st || !Array.isArray(st.frames) || st.frames.length === 0) {
    fail(`state '${name}' has no frames`);
    continue;
  }
  if (st.frames.length > MAX_FRAMES_PER_STATE) {
    fail(`state '${name}' has more than ${MAX_FRAMES_PER_STATE} frames`);
  }
  if (!st.frames.every((f) => Number.isInteger(f) && f >= 0)) {
    fail(`state '${name}' frames must all be non-negative integers`);
  } else if (grid) {
    // Frame indices must land inside the real sheet grid.
    const over = st.frames.filter((f) => f >= grid.cells);
    if (over.length > 0) {
      fail(
        `state '${name}' references frame(s) ${over.join(", ")} but the sheet ` +
          `only has ${grid.cells} (${grid.cols}x${grid.rows})`
      );
    }
  }
  if (!intIn(st.fps, FPS_MIN, FPS_MAX)) {
    fail(`state '${name}' fps must be ${FPS_MIN}..=${FPS_MAX}`);
  }
  if (typeof st.loop !== "boolean") fail(`state '${name}' loop must be true or false`);
}

// ---- Moods must point at states that exist ----
for (const [mood, target] of Object.entries(m.moods ?? {})) {
  if (!(target in states)) {
    fail(`mood '${mood}' points at state '${target}', which is not defined`);
  }
}

// ---- Stages ----
const stages = m.stages ?? [];
if (stages.length > MAX_STAGES) fail(`more than ${MAX_STAGES} stages`);
for (const s of stages) {
  if (!isSafeRelPath(s?.sheet)) {
    fail(`stage '${s?.id ?? "?"}' sheet path is unsafe`);
  } else if (!existsSync(join(packDir, s.sheet))) {
    fail(`stage '${s?.id ?? "?"}' sheet not found: ${s.sheet}`);
  }
  if (!Number.isFinite(s?.minFocusMinutes) || s.minFocusMinutes < 0) {
    fail(`stage '${s?.id ?? "?"}' minFocusMinutes must be >= 0`);
  }
}

// ---- Outfits ----
const outfits = m.outfits ?? [];
if (outfits.length > MAX_OUTFITS) fail(`more than ${MAX_OUTFITS} outfits`);
for (const o of outfits) {
  if (!isSafeRelPath(o?.layer)) fail(`outfit '${o?.id ?? "?"}' layer path is unsafe`);
}

// ---- Personality: clamped by the app, but warn on out-of-range values ----
const warnings = [];
for (const [k, v] of Object.entries(m.personality ?? {})) {
  if (!Number.isFinite(v) || v < 0 || v > 1) {
    warnings.push(`personality.${k} should be 0..1 (the app clamps it); got ${JSON.stringify(v)}`);
  }
}

// ---- Report ----
if (problems.length === 0) {
  console.log(`OK  ${m.name ?? "?"} (${m.id ?? "?"}) v${m.version ?? "?"} - pack is valid`);
  if (grid) {
    console.log(`    sheet grid: ${grid.cols}x${grid.rows} = ${grid.cells} frames`);
  }
  console.log(`    states: ${Object.keys(states).join(", ")}`);
  for (const w of warnings) console.log(`    warning: ${w}`);
  process.exit(0);
}

console.error(`INVALID  ${packDir} - ${problems.length} problem(s):`);
for (const p of problems) console.error(`  - ${p}`);
for (const w of warnings) console.error(`  warning: ${w}`);
process.exit(1);
