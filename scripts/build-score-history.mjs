/**
 * WASI Score History Builder
 * Reconstructs the weekly history of country macro data from the git history
 * of data/country-macros.json and writes a compact time series to
 * data/country-history.json.
 *
 * Usage:  node scripts/build-score-history.mjs
 * Requires: full git history (in CI, checkout with fetch-depth: 0).
 *
 * Output shape:
 * {
 *   generatedAt: ISO,
 *   dates: ["2026-04-27", ...],                 // ascending, one per snapshot
 *   countries: {
 *     NG: { scoreAdj: [3, ...], growth: [3.4, ...], inflation: [...], debt_gdp: [...] },
 *     ...
 *   }
 * }
 */

import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_FILE = 'data/country-macros.json';

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
}

// Commits touching the data file, oldest first: "<sha>|<committer-date-iso>"
const log = git(['log', '--reverse', '--format=%H|%cI', '--', DATA_FILE]).trim();
if (!log) {
  console.error('No history found for ' + DATA_FILE);
  process.exit(1);
}

const snapshots = [];
const seenDates = new Set();

for (const line of log.split('\n')) {
  const [sha, iso] = line.split('|');
  const date = iso.slice(0, 10);
  let json;
  try {
    json = JSON.parse(git(['show', `${sha}:${DATA_FILE}`]));
  } catch {
    continue; // unreadable or pre-format snapshot — skip
  }
  if (!json || !json.countries) continue;
  // One snapshot per calendar day — the last commit of that day wins
  if (seenDates.has(date)) {
    snapshots[snapshots.length - 1] = { date, countries: json.countries };
  } else {
    seenDates.add(date);
    snapshots.push({ date, countries: json.countries });
  }
}

// Include the freshly fetched (not yet committed) working-tree data as the
// latest snapshot, so history is current within the same CI run.
try {
  const { readFileSync } = await import('fs');
  const wt = JSON.parse(readFileSync(join(ROOT, DATA_FILE), 'utf-8'));
  if (wt && wt.countries && wt.fetchedAt) {
    const date = wt.fetchedAt.slice(0, 10);
    if (seenDates.has(date)) {
      snapshots[snapshots.length - 1] = { date, countries: wt.countries };
    } else if (date > snapshots[snapshots.length - 1]?.date) {
      snapshots.push({ date, countries: wt.countries });
    }
  }
} catch { /* no working-tree file — git history alone is fine */ }

if (!snapshots.length) {
  console.error('No parseable snapshots found.');
  process.exit(1);
}

const dates = snapshots.map(s => s.date);
const allCodes = [...new Set(snapshots.flatMap(s => Object.keys(s.countries)))].sort();

const countries = {};
for (const code of allCodes) {
  countries[code] = { scoreAdj: [], growth: [], inflation: [], debt_gdp: [] };
  for (const snap of snapshots) {
    const c = snap.countries[code] || {};
    countries[code].scoreAdj.push(c.scoreAdj ?? null);
    countries[code].growth.push(c.growth ?? null);
    countries[code].inflation.push(c.inflation ?? null);
    countries[code].debt_gdp.push(c.debt_gdp ?? null);
  }
}

const output = { generatedAt: new Date().toISOString(), dates, countries };
mkdirSync(join(ROOT, 'data'), { recursive: true });
const outPath = join(ROOT, 'data', 'country-history.json');
writeFileSync(outPath, JSON.stringify(output), 'utf-8');

console.log(`✅ ${snapshots.length} snapshots (${dates[0]} → ${dates[dates.length - 1]}) · ${allCodes.length} countries`);
console.log(`📁 Saved → ${outPath}`);
