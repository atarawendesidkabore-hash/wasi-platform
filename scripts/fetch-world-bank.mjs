/**
 * WASI World Bank Data Fetcher
 * Pulls live GDP, growth, inflation and debt data for all 54 African countries
 * from the World Bank Open Data API (free, no key required).
 *
 * Usage:  node scripts/fetch-world-bank.mjs
 * Output: data/country-macros.json
 *
 * Run by GitHub Actions every Monday at 06:00 UTC.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── ISO2 → ISO3 mapping for all 54 WASI countries ──────────────────────────
const ISO2_TO_ISO3 = {
  // CEDEAO
  NG: 'NGA', CI: 'CIV', GH: 'GHA', SN: 'SEN', BF: 'BFA', ML: 'MLI',
  GN: 'GIN', BJ: 'BEN', TG: 'TGO', NE: 'NER', MR: 'MRT', GW: 'GNB',
  SL: 'SLE', LR: 'LBR', GM: 'GMB', CV: 'CPV',
  // CEMAC
  CM: 'CMR', GA: 'GAB', CG: 'COG', CD: 'COD', CF: 'CAF', TD: 'TCD', GQ: 'GNQ',
  // EAC / IGAD
  KE: 'KEN', TZ: 'TZA', UG: 'UGA', RW: 'RWA', BI: 'BDI', SS: 'SSD',
  ET: 'ETH', DJ: 'DJI', ER: 'ERI', SO: 'SOM', SD: 'SDN',
  // SADC
  ZA: 'ZAF', MZ: 'MOZ', ZW: 'ZWE', ZM: 'ZMB', BW: 'BWA', NA: 'NAM',
  MW: 'MWI', AO: 'AGO', MG: 'MDG', MU: 'MUS', SC: 'SYC', SZ: 'SWZ',
  LS: 'LSO', KM: 'COM',
  // UMA / Afrique du Nord
  MA: 'MAR', TN: 'TUN', EG: 'EGY', DZ: 'DZA', LY: 'LBY',
};

// Fallback values for countries with no World Bank data (conflict zones, etc.)
const FALLBACK = {
  SS: { gdp_usd: 4.6e9,  growth: -5.0, inflation: 45.0, debt_gdp: null },
  ER: { gdp_usd: 2.1e9,  growth:  1.5, inflation: 20.0, debt_gdp: null },
  SO: { gdp_usd: 8.1e9,  growth:  2.9, inflation: 14.5, debt_gdp: null },
};

// ── World Bank API ──────────────────────────────────────────────────────────
const WB_BASE = 'https://api.worldbank.org/v2';

const INDICATORS = {
  gdp:       'NY.GDP.MKTP.CD',   // GDP current USD
  growth:    'NY.GDP.MKTP.KD.ZG', // GDP growth %
  inflation: 'FP.CPI.TOTL.ZG',   // Inflation, consumer prices %
  debt:      'GC.DOD.TOTL.GD.ZS', // Central government debt % GDP
};

async function fetchIndicator(indicatorCode, iso3Codes) {
  const batch = iso3Codes.join(';');
  // mrv=3 → most recent 3 years, so we get the latest non-null value
  const url = `${WB_BASE}/country/${batch}/indicator/${indicatorCode}?format=json&mrv=3&per_page=600`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`World Bank API ${res.status} for ${indicatorCode}`);
  const [, data] = await res.json();

  // Build map: iso3 → {value, year} using the most recent non-null entry
  const map = {};
  if (Array.isArray(data)) {
    for (const row of data) {
      const code = row.countryiso3code;
      if (!code || row.value === null) continue;
      if (!(code in map)) {
        map[code] = { value: row.value, year: row.date };
      }
    }
  }
  return map;
}

// ── Formatting helpers ──────────────────────────────────────────────────────
function fmtGDP(usd) {
  if (usd == null) return null;
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(1)}T`;
  if (usd >= 1e9)  return `$${Math.round(usd / 1e9)}B`;
  return `$${Math.round(usd / 1e6)}M`;
}

function r1(n) { return n != null ? parseFloat(n.toFixed(1)) : null; }

// ── Score adjustment: –5 to +5 based on macro fundamentals ─────────────────
function computeScoreAdj({ growth, inflation, debt }) {
  let adj = 0;
  if (growth != null) {
    if      (growth >= 7) adj += 4;
    else if (growth >= 5) adj += 3;
    else if (growth >= 3) adj += 2;
    else if (growth >= 1) adj += 1;
    else if (growth < 0)  adj -= 3;
  }
  if (inflation != null) {
    if      (inflation <= 3)  adj += 1;
    else if (inflation >= 30) adj -= 3;
    else if (inflation >= 15) adj -= 2;
    else if (inflation >= 10) adj -= 1;
  }
  if (debt != null) {
    if      (debt >= 100) adj -= 3;
    else if (debt >= 80)  adj -= 2;
    else if (debt >= 60)  adj -= 1;
  }
  return Math.max(-5, Math.min(5, Math.round(adj)));
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const iso2List = Object.keys(ISO2_TO_ISO3);
  const iso3List = Object.values(ISO2_TO_ISO3);

  console.log(`\nWASI World Bank Fetcher — ${new Date().toISOString()}`);
  console.log(`Fetching data for ${iso3List.length} countries...\n`);

  // Fetch all 4 indicators in parallel
  const [gdpMap, growthMap, inflMap, debtMap] = await Promise.all([
    fetchIndicator(INDICATORS.gdp,       iso3List),
    fetchIndicator(INDICATORS.growth,    iso3List),
    fetchIndicator(INDICATORS.inflation, iso3List),
    fetchIndicator(INDICATORS.debt,      iso3List),
  ]);

  const fetchedAt = new Date().toISOString();
  const countries = {};
  let ok = 0, partial = 0;

  for (const iso2 of iso2List) {
    const iso3 = ISO2_TO_ISO3[iso2];
    const fb   = FALLBACK[iso2] || {};

    const gdp_usd   = gdpMap[iso3]?.value    ?? fb.gdp_usd   ?? null;
    const growth    = growthMap[iso3]?.value  ?? fb.growth    ?? null;
    const inflation = inflMap[iso3]?.value    ?? fb.inflation ?? null;
    const debt_gdp  = debtMap[iso3]?.value   ?? fb.debt_gdp  ?? null;

    const entry = {
      iso3,
      gdp_usd,
      gdp_fmt:      fmtGDP(gdp_usd),
      gdp_year:     gdpMap[iso3]?.year    || null,
      growth:       r1(growth),
      growth_year:  growthMap[iso3]?.year || null,
      inflation:    r1(inflation),
      debt_gdp:     r1(debt_gdp),
      scoreAdj:     computeScoreAdj({ growth, inflation, debt: debt_gdp }),
      source:       'World Bank Open Data',
      fetchedAt,
    };

    countries[iso2] = entry;

    const hasAll = gdp_usd != null && growth != null && inflation != null;
    if (hasAll) ok++; else partial++;

    const tag = hasAll ? '✅' : '⚠️ ';
    console.log(
      `${tag} ${iso2} | GDP: ${entry.gdp_fmt || 'N/A'} (${entry.gdp_year || '?'})` +
      ` | Growth: ${entry.growth != null ? entry.growth + '%' : 'N/A'}` +
      ` | Inflation: ${entry.inflation != null ? entry.inflation + '%' : 'N/A'}` +
      ` | Debt: ${entry.debt_gdp != null ? entry.debt_gdp + '%' : 'N/A'}` +
      ` | ScoreAdj: ${entry.scoreAdj >= 0 ? '+' : ''}${entry.scoreAdj}`
    );
  }

  const output = { fetchedAt, source: 'World Bank Open Data API', countries };
  const outPath = join(ROOT, 'data', 'country-macros.json');
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n✅ Complete: ${ok} full, ${partial} partial`);
  console.log(`📁 Saved → ${outPath}`);
}

main().catch(err => {
  console.error('\n❌ Fetch failed:', err.message);
  process.exit(1);
});
