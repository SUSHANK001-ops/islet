// size-report: print the built installer size and fail if over the 15 MB
// budget (AGENTS.md "Bundle" rule). Looks in src-tauri/target/release/bundle.
//
// Usage: npm run size-report
// Run after `npm run tauri build`.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BUDGET_MB = 15;
const bundleDir = "src-tauri/target/release/bundle";

function findInstallers(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...findInstallers(p));
    } else if (/\.(exe|msi|nsis)$/i.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const installers = findInstallers(bundleDir);
if (installers.length === 0) {
  console.error(
    `size-report: no installer found in ${bundleDir}. Run 'npm run tauri build' first.`
  );
  process.exit(1);
}

let failed = false;
for (const file of installers) {
  const mb = statSync(file).size / (1024 * 1024);
  const ok = mb <= BUDGET_MB;
  if (!ok) failed = true;
  console.log(`${ok ? "OK " : "OVER"}  ${mb.toFixed(2)} MB  ${file}`);
}

console.log(`\nBudget: ${BUDGET_MB} MB`);
process.exit(failed ? 1 : 0);
