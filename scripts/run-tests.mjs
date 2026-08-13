/**
 * Test entry point.
 *
 * Discovers every tests/**\/*.test.mjs and hands the explicit file list to
 * Node's built-in runner. This avoids two traps that already bit once:
 *
 *  - `node --test "tests/**\/*.test.mjs"` needs glob support, which arrived in
 *    Node 22. CI runs Node 20, so it passed locally and failed in CI.
 *  - `node --test tests/` is not a directory scan on current Node; it tries to
 *    load "tests" as a module.
 *  - Listing files by hand in package.json means a new suite silently never
 *    runs — which is exactly what happened to the amortisation tests.
 *
 * Explicit file paths are accepted by every supported Node version, and
 * discovery is done here so adding a suite needs no configuration change.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const testsDir = join(root, "tests");

function collect(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collect(full));
    else if (/\.test\.mjs$/.test(entry)) found.push(full);
  }
  return found.sort();
}

let files;
try {
  files = collect(testsDir);
} catch (error) {
  console.error("Cannot read tests directory:", error.message);
  process.exit(1);
}

if (!files.length) {
  console.error("No test files found in tests/ — refusing to report success.");
  process.exit(1);
}

console.log(`Running ${files.length} test file(s):`);
for (const file of files) console.log("  " + relative(root, file));

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
