// CI guard (Spec 11): fail if the DEV-only gallery leaks into the release
// bundle. Greps the built dist/ for the gallery marker string. Run after
// `vite build` (wire into CI / the release script).
//
// Usage: node scripts/check-no-dev.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MARKER = "__ISLET_DEV_GALLERY__";
const distDir = "dist";

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(distDir).filter((f) => /\.(js|html|css)$/i.test(f));
if (files.length === 0) {
  console.error(`check-no-dev: no built files in ${distDir}/. Run 'vite build' first.`);
  process.exit(1);
}

const offenders = files.filter((f) => {
  try {
    return statSync(f).isFile() && readFileSync(f, "utf8").includes(MARKER);
  } catch {
    return false;
  }
});

if (offenders.length > 0) {
  console.error("check-no-dev: DEV gallery marker found in release bundle:");
  for (const f of offenders) console.error("  " + f);
  process.exit(1);
}

console.log(`check-no-dev: OK — DEV gallery is not in the release bundle (${files.length} files scanned).`);
