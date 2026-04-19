/**
 * Agent 6 sandbox test runner.
 *
 * Usage (from CrisisIntake/):
 *   npx tsx src/services/__tests__/run-all.ts
 *
 * Auto-discovers *.test.ts siblings and imports them in filename order.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((f) => f.endsWith(".test.mts"))
  .sort();

console.log("\n\x1b[1m═══════════════════════════════════════════════════════════\x1b[0m");
console.log("\x1b[1m  Agent 6 — Sandbox Test Suite\x1b[0m");
console.log("\x1b[1m═══════════════════════════════════════════════════════════\x1b[0m");

for (const f of files) {
  await import(join(here, f));
}

console.log("\n\x1b[1m═══════════════════════════════════════════════════════════\x1b[0m");
console.log("\x1b[1m  Done.\x1b[0m");
console.log("\x1b[1m═══════════════════════════════════════════════════════════\x1b[0m\n");
