// catalog-build (Spec 13): build a SIGNED catalog index.json from the packs in
// catalog/packs/, computing each pack's SHA-256 + size, then sign index.json
// with an Ed25519 private key you supply. The private key NEVER lives in the
// repo — pass its path via the env var ISLET_CATALOG_KEY (32-byte raw or hex).
//
// Layout produced:
//   catalog/index.json   (list of entries)
//   catalog/index.sig    (hex-encoded Ed25519 signature of index.json bytes)
//
// Usage:
//   ISLET_CATALOG_KEY=path/to/ed25519.key node scripts/catalog-build.mjs
//
// Each pack folder under catalog/packs/<id>/ must contain a valid manifest.json
// and (optionally) preview.png. The pack is zipped to
// catalog/packs/<id>-<version>.islet-char for serving. A human reviews art +
// license BEFORE running this; the script does not create or alter art.

import { createHash, sign } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const ALLOWED = ["CC0-1.0", "CC-BY-4.0", "MIT"];
const CATALOG = "catalog";
const PACKS = join(CATALOG, "packs");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(msg) {
  console.error("catalog-build: " + msg);
  process.exit(1);
}

// Load the Ed25519 private key (PKCS8 PEM). We require PEM to use node:crypto's
// sign() directly without extra deps.
const keyPath = process.env.ISLET_CATALOG_KEY;
if (!keyPath || !existsSync(keyPath)) {
  fail("set ISLET_CATALOG_KEY to your Ed25519 private key (PKCS8 PEM). It must NOT be in the repo.");
}
const privateKeyPem = readFileSync(keyPath, "utf8");

if (!existsSync(PACKS)) fail(`no ${PACKS}/ folder. Create catalog/packs/<id>/ first.`);

// zip each pack folder (reuse the same approach as the app export). We shell
// out to the `zip` behavior via the archiver available through the project's
// zip script is Rust-side; here we build a store-only zip with node.
const require = createRequire(import.meta.url);
let AdmZip;
try {
  AdmZip = require("adm-zip");
} catch {
  fail("this script needs 'adm-zip' (npm i -D adm-zip) to package .islet-char files.");
}

const entries = [];
for (const id of readdirSync(PACKS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const dir = join(PACKS, id);
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.warn(`skip ${id}: no manifest.json`);
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!ALLOWED.includes(manifest.license)) {
    fail(`pack ${id} license '${manifest.license}' not allowed (use ${ALLOWED.join(", ")}).`);
  }

  // Zip the folder into catalog/packs/<id>-<version>.islet-char
  const zip = new AdmZip();
  zip.addLocalFolder(dir);
  const packFile = `packs/${id}-${manifest.version}.islet-char`;
  const packAbs = join(CATALOG, packFile);
  zip.writeZip(packAbs);
  const packBytes = readFileSync(packAbs);

  // Preview (optional)
  let previewFile = null, previewSha256 = null;
  const prev = join(dir, "preview.png");
  if (existsSync(prev)) {
    previewFile = `previews/${id}.png`;
    const pbytes = readFileSync(prev);
    writeFileSync(join(CATALOG, previewFile), pbytes);
    previewSha256 = sha256(pbytes);
  }

  entries.push({
    id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    license: manifest.license,
    sourceUrl: manifest.sourceUrl || "",
    packFile,
    packSha256: sha256(packBytes),
    packSizeBytes: statSync(packAbs).size,
    previewFile,
    previewSha256,
    minAppVersion: manifest.minAppVersion || null,
    tags: manifest.tags || [],
    placeholder: !!manifest.placeholder,
  });
  console.log(`packed ${id} (${(statSync(packAbs).size / 1024).toFixed(0)} KB)`);
}

const index = { schemaVersion: 1, characters: entries };
const indexBytes = Buffer.from(JSON.stringify(index, null, 2), "utf8");
writeFileSync(join(CATALOG, "index.json"), indexBytes);

// Sign the exact index.json bytes with Ed25519 (node crypto: algorithm null).
const signature = sign(null, indexBytes, privateKeyPem);
writeFileSync(join(CATALOG, "index.sig"), signature.toString("hex"));

console.log(`\nWrote ${CATALOG}/index.json (${entries.length} entries) + index.sig`);
console.log("Publish the catalog/ folder as static HTTPS files and set catalog.baseUrl + the public key in the app.");
