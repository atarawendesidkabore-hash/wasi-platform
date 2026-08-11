/**
 * AFEX Profile Builder — promotes country funds from Starter to Detailed.
 *
 * A "Detailed" AFEX profile needs real, sourced index weights rather than a
 * prose note. This pulls official export statistics from UN Comtrade for
 * every AFEX country and derives:
 *   - constituent weights (trailing average share of total exports, HS2 level)
 *   - concentration metrics (top-1, top-5, HHI) — the basis of the
 *     diversification warnings the family already talks about
 *   - the years actually covered, so the weights are auditable
 *
 * IMPORTANT — weighting basis:
 * The published AFEX methodology says "trailing 20-year average export
 * TONNAGE". Comtrade net weight is not reported by most African reporters
 * (Burkina Faso 2022: 0 of 86 HS2 lines carry netWgt), mirror data is not
 * available on the free endpoint, and FAOSTAT now requires a key. So weights
 * here are computed on EXPORT VALUE (USD), which is fully reported, and every
 * profile is labelled `weighting_basis: "export_value_usd"`. Tonnage remains
 * the target basis where official country statistics can supply it.
 *
 * Usage:
 *   node scripts/build-afex-profiles.mjs                # all countries
 *   node scripts/build-afex-profiles.mjs BUREX ZMBEX    # only these codes
 *   node scripts/build-afex-profiles.mjs --years=2014-2023
 *
 * Responses are cached under data/.afex-cache/ so reruns are cheap and a
 * rate-limited run can simply be restarted.
 *
 * Output: data/afex-profiles.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, 'data', '.afex-cache');
const UA = { 'User-Agent': 'Mozilla/5.0 (WASI AFEX profile builder)' };

// ── HS2 → commodity label. Only export-relevant chapters are named; anything
//    else falls back to a generic label so nothing is silently dropped.
const HS2_LABELS = {
  '01': 'Live Animals', '02': 'Meat', '03': 'Fish and Seafood', '04': 'Dairy Produce',
  '05': 'Animal Products', '06': 'Live Plants and Cut Flowers', '07': 'Vegetables',
  '08': 'Edible Fruit and Nuts', '09': 'Coffee, Tea and Spices', '10': 'Cereals',
  '11': 'Milling Products', '12': 'Oil Seeds and Oleaginous Fruits', '13': 'Gums and Resins',
  '14': 'Vegetable Products', '15': 'Animal and Vegetable Fats', '16': 'Prepared Meat and Fish',
  '17': 'Sugar and Confectionery', '18': 'Cocoa and Cocoa Preparations', '19': 'Cereal Preparations',
  '20': 'Prepared Vegetables and Fruit', '21': 'Food Preparations', '22': 'Beverages and Spirits',
  '23': 'Animal Feed and Residues', '24': 'Tobacco', '25': 'Salt, Stone, Cement and Plaster',
  '26': 'Metal Ores, Slag and Ash', '27': 'Mineral Fuels, Oil and Gas', '28': 'Inorganic Chemicals',
  '29': 'Organic Chemicals', '30': 'Pharmaceutical Products', '31': 'Fertilizers',
  '32': 'Tanning and Dyeing Extracts', '33': 'Essential Oils and Cosmetics', '34': 'Soaps and Waxes',
  '38': 'Miscellaneous Chemical Products', '39': 'Plastics', '40': 'Rubber',
  '41': 'Raw Hides and Leather', '42': 'Leather Articles', '43': 'Furskins',
  '44': 'Wood and Timber', '45': 'Cork', '46': 'Basketwork', '47': 'Wood Pulp',
  '48': 'Paper and Paperboard', '50': 'Silk', '51': 'Wool and Animal Hair', '52': 'Cotton',
  '53': 'Other Vegetable Textile Fibres', '54': 'Man-made Filaments', '55': 'Man-made Staple Fibres',
  '57': 'Carpets', '61': 'Knitted Apparel', '62': 'Woven Apparel', '63': 'Textile Articles',
  '64': 'Footwear', '68': 'Stone and Cement Articles', '69': 'Ceramic Products', '70': 'Glass',
  '71': 'Precious Stones and Metals', '72': 'Iron and Steel', '73': 'Iron and Steel Articles',
  '74': 'Copper', '75': 'Nickel', '76': 'Aluminium', '78': 'Lead', '79': 'Zinc', '80': 'Tin',
  '81': 'Other Base Metals', '82': 'Tools and Cutlery', '83': 'Miscellaneous Metal Articles',
  '84': 'Machinery', '85': 'Electrical Machinery', '86': 'Railway Equipment',
  '87': 'Vehicles', '88': 'Aircraft', '89': 'Ships and Boats', '90': 'Optical and Medical Instruments',
  '94': 'Furniture', '95': 'Toys and Sports Equipment', '97': 'Works of Art',
};

function hs2Label(code) {
  const c = String(code).padStart(2, '0');
  return HS2_LABELS[c] || `HS ${c} — Other Goods`;
}

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const yearArg = args.find((a) => a.startsWith('--years='));
const onlyCodes = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());
const [YEAR_FROM, YEAR_TO] = yearArg
  ? yearArg.replace('--years=', '').split('-').map(Number)
  : [2014, 2023];

const YEARS = [];
for (let y = YEAR_FROM; y <= YEAR_TO; y++) YEARS.push(y);

// Promotion thresholds: enough years and enough breadth to stand behind.
const MIN_YEARS = 5;
const MIN_CONSTITUENTS = 3;
const MAX_CONSTITUENTS = 10;

// ── AFEX family list, read straight out of the app so there is one list ─────
function readAfexFamily() {
  const src = readFileSync(join(ROOT, 'wasi-dex', 'app.js'), 'utf-8');
  const re = /\{\s*code:\s*"([A-Z0-9]+)",\s*country:\s*"([^"]+)",\s*iso3:\s*"([A-Z]{3})"/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ code: m[1], country: m[2], iso3: m[3] });
  }
  return out;
}

async function getJson(url, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.status === 429) throw new Error('rate limited (429)');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
}

async function loadReporterMap() {
  const cache = join(CACHE_DIR, 'reporters.json');
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf-8'));
  const raw = await getJson('https://comtradeapi.un.org/files/v1/app/reference/Reporters.json');
  const list = raw.results || raw;
  const map = {};
  for (const r of list) {
    if (r.reporterCodeIsoAlpha3) map[r.reporterCodeIsoAlpha3] = r.reporterCode;
  }
  writeFileSync(cache, JSON.stringify(map), 'utf-8');
  return map;
}

/** One country-year of HS2 export values, cached on disk. */
async function fetchYear(reporterCode, year) {
  const cache = join(CACHE_DIR, `${reporterCode}-${year}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf-8'));

  const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${reporterCode}` +
    `&period=${year}&flowCode=X&cmdCode=AG2&partnerCode=0&partner2Code=0&customsCode=C00&motCode=0`;
  const json = await getJson(url);
  const rows = (json.data || [])
    .filter((r) => r.primaryValue > 0 && r.cmdCode && r.cmdCode !== 'TOTAL')
    .map((r) => ({ hs2: String(r.cmdCode).padStart(2, '0'), value: r.primaryValue, netWgt: r.netWgt || 0 }));
  writeFileSync(cache, JSON.stringify(rows), 'utf-8');
  await new Promise((r) => setTimeout(r, 700)); // be polite to the public endpoint
  return rows;
}

function buildProfile(entry, yearData) {
  // yearData: { year: rows[] } — only years that returned data
  const years = Object.keys(yearData).map(Number).sort();
  if (!years.length) return null;

  // Average each chapter's SHARE across years (not raw USD), so a single
  // boom year cannot dominate the weights.
  const shareSums = {};
  let tonnageLines = 0;
  let totalLines = 0;

  for (const y of years) {
    const rows = yearData[y];
    const total = rows.reduce((s, r) => s + r.value, 0);
    if (!total) continue;
    for (const r of rows) {
      shareSums[r.hs2] = (shareSums[r.hs2] || 0) + r.value / total;
      totalLines++;
      if (r.netWgt > 0) tonnageLines++;
    }
  }

  const averaged = Object.entries(shareSums)
    .map(([hs2, sum]) => ({ hs2, share: sum / years.length }))
    .sort((a, b) => b.share - a.share);

  const top = averaged.slice(0, MAX_CONSTITUENTS);
  const topSum = top.reduce((s, c) => s + c.share, 0) || 1;

  const constituents = top.map((c) => ({
    hs2: c.hs2,
    name: hs2Label(c.hs2),
    weight: +((c.share / topSum) * 100).toFixed(2),      // renormalised index weight
    export_share: +(c.share * 100).toFixed(2),           // share of the whole export basket
  }));

  // Concentration on the full basket, not just the retained constituents.
  const hhi = Math.round(averaged.reduce((s, c) => s + Math.pow(c.share * 100, 2), 0));
  const top1 = +((averaged[0]?.share || 0) * 100).toFixed(2);
  const top5 = +(averaged.slice(0, 5).reduce((s, c) => s + c.share, 0) * 100).toFixed(2);

  const latestYear = years[years.length - 1];
  const latestTotal = (yearData[latestYear] || []).reduce((s, r) => s + r.value, 0);

  const qualifies = years.length >= MIN_YEARS && constituents.length >= MIN_CONSTITUENTS;

  return {
    code: entry.code,
    country: entry.country,
    iso3: entry.iso3,
    detail_level: qualifies ? 'detailed_prototype_ready' : 'starter_profile',
    weighting_basis: 'export_value_usd',
    weighting_note: 'Trailing average of annual export-value shares (HS2). Tonnage weighting is not computable: UN Comtrade net weight is unreported for these reporters.',
    source: 'UN Comtrade (public preview API)',
    years_covered: years,
    years_count: years.length,
    latest_year: latestYear,
    latest_total_export_usd: Math.round(latestTotal),
    tonnage_coverage_pct: totalLines ? +((tonnageLines / totalLines) * 100).toFixed(1) : 0,
    concentration: { top1_pct: top1, top5_pct: top5, hhi: hhi,
      classification: hhi >= 2500 ? 'tres_concentre' : hhi >= 1500 ? 'concentre' : 'diversifie' },
    constituents,
  };
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const family = readAfexFamily();
  const selected = onlyCodes.length ? family.filter((f) => onlyCodes.includes(f.code)) : family;

  console.log(`\nAFEX Profile Builder — ${new Date().toISOString()}`);
  console.log(`Countries: ${selected.length}/${family.length} · Years: ${YEAR_FROM}-${YEAR_TO}\n`);
  if (!selected.length) { console.error('No matching AFEX codes.'); process.exit(1); }

  const reporters = await loadReporterMap();

  // Merge into any existing output so partial runs accumulate.
  const outPath = join(ROOT, 'data', 'afex-profiles.json');
  let existing = { countries: {} };
  if (existsSync(outPath)) {
    try { existing = JSON.parse(readFileSync(outPath, 'utf-8')); } catch { /* rebuild */ }
  }
  const countries = existing.countries || {};

  let promoted = 0, kept = 0, failed = 0;

  for (const entry of selected) {
    const reporterCode = reporters[entry.iso3];
    if (!reporterCode) {
      console.log(`⚠️  ${entry.code} (${entry.iso3}) — not a Comtrade reporter, skipped`);
      failed++;
      continue;
    }

    const yearData = {};
    for (const y of YEARS) {
      try {
        const rows = await fetchYear(reporterCode, y);
        if (rows.length) yearData[y] = rows;
      } catch (err) {
        console.log(`   ${entry.code} ${y}: ${err.message}`);
      }
    }

    const profile = buildProfile(entry, yearData);
    if (!profile) {
      console.log(`⚠️  ${entry.code} ${entry.country} — no export data returned`);
      failed++;
      continue;
    }

    countries[entry.code] = profile;
    const isDetailed = profile.detail_level === 'detailed_prototype_ready';
    if (isDetailed) promoted++; else kept++;

    const lead = profile.constituents[0];
    console.log(
      `${isDetailed ? '✅' : '◽'} ${entry.code.padEnd(7)} ${entry.country.padEnd(26)} ` +
      `${String(profile.years_count).padStart(2)}y · ${String(profile.constituents.length).padStart(2)} lignes · ` +
      `HHI ${String(profile.concentration.hhi).padStart(4)} · ` +
      `n°1 ${lead ? lead.name + ' ' + lead.weight + '%' : 'n/a'}`
    );
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'UN Comtrade (public preview API)',
    weighting_basis: 'export_value_usd',
    year_range: `${YEAR_FROM}-${YEAR_TO}`,
    promotion_rule: `detailed when >= ${MIN_YEARS} years of data and >= ${MIN_CONSTITUENTS} constituents`,
    countries,
  };
  writeFileSync(outPath, JSON.stringify(output, null, 1), 'utf-8');

  const total = Object.keys(countries).length;
  const detailedTotal = Object.values(countries).filter((c) => c.detail_level === 'detailed_prototype_ready').length;
  console.log(`\n✅ Detailed: ${detailedTotal}/${total} profiles (this run: +${promoted} detailed, ${kept} starter, ${failed} failed)`);
  console.log(`📁 Saved → ${outPath}`);
}

main().catch((err) => { console.error('\n❌ Build failed:', err.message); process.exit(1); });
