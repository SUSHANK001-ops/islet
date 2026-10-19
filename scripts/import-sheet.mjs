// import-sheet (Spec 13): turn a raw sprite sheet + a small frame-map JSON into
// a character pack folder a human then reviews. License, author, and source are
// REQUIRED inputs (the catalog only accepts CC0-1.0 / CC-BY-4.0 / MIT). This
// script copies files and writes manifest.json; it never creates or alters art.
//
// Usage:
//   node scripts/import-sheet.mjs <sheet.png> <framemap.json> <outDir>
//
// framemap.json shape (example):
// {
//   "id": "my-pal", "name": "My Pal", "version": "1.0.0",
//   "author": "Jane Doe", "license": "CC-BY-4.0",
//   "sourceUrl": "https://example.com/my-pal",
//   "frameWidth": 48, "frameHeight": 48, "columns": 8, "scale": 2,
//   "pixelArt": true,
//   "states": { "idle": {"frames":[0,1,2,3],"fps":6,"loop":true}, ... }
// }

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = ["CC0-1.0", "CC-BY-4.0", "MIT"];
const REQUIRED_STATES = ["idle", "working", "celebrating", "sleeping", "sad"];

function fail(m) {
  console.error("import-sheet: " + m);
  process.exit(1);
}

const [sheet, mapPath, outDir] = process.argv.slice(2);
if (!sheet || !mapPath || !outDir) {
  fail("usage: node scripts/import-sheet.mjs <sheet.png> <framemap.json> <outDir>");
}
if (!existsSync(sheet)) fail(`sheet not found: ${sheet}`);
if (!existsSync(mapPath)) fail(`frame-map not found: ${mapPath}`);

const map = JSON.parse(readFileSync(mapPath, "utf8"));

for (const f of ["id", "name", "version", "author", "license"]) {
  if (!map[f]) fail(`frame-map is missing required field: ${f}`);
}
if (!ALLOWED.includes(map.license)) {
  fail(`license '${map.license}' not allowed. Use one of ${ALLOWED.join(", ")}.`);
}
if (!/^[a-z0-9-]{3,40}$/.test(map.id)) {
  fail("id must be 3-40 chars of lowercase letters, digits and hyphens.");
}
for (const s of REQUIRED_STATES) {
  if (!map.states || !map.states[s]) fail(`frame-map is missing required state: ${s}`);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(sheet, join(outDir, "sheet.png"));

const manifest = {
  schemaVersion: 1,
  id: map.id,
  name: map.name,
  version: map.version,
  author: map.author,
  license: map.license,
  sourceUrl: map.sourceUrl || "",
  sheet: {
    file: "sheet.png",
    frameWidth: map.frameWidth ?? 48,
    frameHeight: map.frameHeight ?? 48,
    columns: map.columns ?? 8,
    scale: map.scale ?? 2,
    pixelArt: !!map.pixelArt,
  },
  states: map.states,
  moods: map.moods || {},
  stages: map.stages || [],
  personality: map.personality || { energy: 0.5, chatty: 0.5, lazy: 0.5 },
  outfits: map.outfits || [],
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

// A LICENSE.txt stub the human must complete/verify.
writeFileSync(
  join(outDir, "LICENSE.txt"),
  `${map.name}\nAuthor: ${map.author}\nLicense: ${map.license}\nSource: ${map.sourceUrl || "(add source)"}\n\n` +
    `Confirm this art is ORIGINAL or properly licensed under ${map.license}. ` +
    `Never ship art based on an existing cartoon, game, or brand character.\n`
);

console.log(`import-sheet: wrote ${outDir}/ (manifest.json, sheet.png, LICENSE.txt).`);
console.log("Next: review the art + license by hand, then run scripts/catalog-build.mjs.");
