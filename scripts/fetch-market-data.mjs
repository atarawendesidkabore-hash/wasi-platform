/**
 * WASI Market Data Fetcher
 * Pulls daily market data from free, keyless sources:
 *   - FX rates        : open.er-api.com (all pairs, quoted vs XOF)
 *   - Crypto          : CoinGecko simple price API
 *   - BRVM (UEMOA)    : scraped from brvm.org's own quote strip
 *   - JSE / EGX / NSE : Yahoo Finance chart API (.JO / .CA / .NR suffixes)
 * NGX, GSE and other exchanges have no free public feed — the app keeps
 * its reference data for them and labels it as such.
 *
 * Usage:  node scripts/fetch-market-data.mjs
 * Output: data/market-live.json
 * Run by GitHub Actions every weekday at 18:15 UTC (after market close).
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const UA = { 'User-Agent': 'Mozilla/5.0 (WASI market fetcher)' };

async function getJson(url, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, 8000 * (attempt + 1)));
    }
  }
}

// ── FX: everything vs XOF ───────────────────────────────────────────────────
async function fetchFx() {
  const data = await getJson('https://open.er-api.com/v6/latest/USD');
  if (!data || data.result !== 'success') throw new Error('er-api result != success');
  const perUsd = data.rates; // units of CUR per 1 USD
  const xofPerUsd = perUsd.XOF;
  const pairs = {};
  for (const [cur, rate] of Object.entries(perUsd)) {
    if (!rate || cur === 'XOF') continue;
    // 1 CUR = (XOF/USD) / (CUR/USD) XOF
    pairs[cur + '/XOF'] = xofPerUsd / rate;
  }
  return { date: data.time_last_update_utc, xofPerUsd, pairs, source: 'open.er-api.com' };
}

// ── Crypto ──────────────────────────────────────────────────────────────────
const CRYPTO_IDS = { BTC: 'bitcoin', ETH: 'ethereum', USDC: 'usd-coin', MATIC: 'matic-network' };
async function fetchCrypto() {
  const ids = Object.values(CRYPTO_IDS).join(',');
  const data = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`);
  const out = {};
  for (const [sym, id] of Object.entries(CRYPTO_IDS)) {
    const d = data[id];
    if (!d || d.usd == null) continue;
    out[sym] = {
      usd: d.usd,
      change: d.usd_24h_change != null ? +d.usd_24h_change.toFixed(2) : null,
      cap: d.usd_market_cap != null ? '$' + (d.usd_market_cap >= 1e12 ? (d.usd_market_cap/1e12).toFixed(2)+'T' : Math.round(d.usd_market_cap/1e9)+'B') : null,
    };
  }
  return { quotes: out, source: 'CoinGecko' };
}

// ── BRVM: scrape the official quote strip ───────────────────────────────────
async function fetchBrvm() {
  const res = await fetch('https://www.brvm.org/en/cours-actions/0', { headers: UA });
  if (!res.ok) throw new Error(`brvm.org HTTP ${res.status}`);
  const html = await res.text();
  const re = /<div class="item"><span>([A-Z0-9]+)<\/span>&nbsp;<span>([\d\s  ]+)<\/span>&nbsp;<span>(-?[\d,.]+)%<\/span>/g;
  const quotes = {};
  let m;
  while ((m = re.exec(html)) !== null) {
    const price = parseInt(m[2].replace(/[\s  ]/g, ''), 10);
    const change = parseFloat(m[3].replace(',', '.'));
    if (!isNaN(price)) quotes[m[1]] = { price, change: isNaN(change) ? null : change };
  }
  if (!Object.keys(quotes).length) throw new Error('no BRVM quotes parsed — page layout changed?');
  return { quotes, source: 'brvm.org (cours officiels)' };
}

// ── Yahoo Finance: JSE (.JO), EGX (.CA), NSE Kenya (.NR) ────────────────────
const YAHOO_EXCHANGES = {
  JSE: { suffix: '.JO', tickers: ['NPN','AMS','SOL','FSR','SBK','MTN','SHP','GFI','IMP','SSW','VOD','CPI'] },
  EGX: { suffix: '.CA', tickers: ['COMI','EAST','FWRY','ETEL','HRHO','SWDY','ORAS','TMGH','ABUK','JUFO'] },
  NSE: { suffix: '.NR', tickers: ['SCOM','EQTY','KCB','EABL','BAT','COOP','BAMB','NCBA'] },
};

async function fetchYahoo(ticker) {
  const data = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`, 1);
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) return null;
  const prev = meta.previousClose ?? meta.chartPreviousClose;
  const change = prev ? +(((meta.regularMarketPrice / prev) - 1) * 100).toFixed(2) : null;
  return { price: meta.regularMarketPrice, change, currency: meta.currency };
}

async function fetchYahooExchanges() {
  const out = {};
  for (const [ex, cfg] of Object.entries(YAHOO_EXCHANGES)) {
    const quotes = {};
    for (const t of cfg.tickers) {
      try {
        const q = await fetchYahoo(t + cfg.suffix);
        if (q) quotes[t] = { price: q.price, change: q.change };
      } catch (_) { /* individual ticker failures are non-fatal */ }
      await new Promise(r => setTimeout(r, 400)); // be polite to Yahoo
    }
    if (Object.keys(quotes).length) out[ex] = { quotes, source: 'Yahoo Finance' };
    console.log(`  ${ex}: ${Object.keys(quotes).length}/${cfg.tickers.length} tickers`);
  }
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nWASI Market Fetcher — ${new Date().toISOString()}`);
  const out = { fetchedAt: new Date().toISOString(), fx: null, crypto: null, stocks: {} };
  const errors = [];

  await Promise.all([
    fetchFx().then(fx => { out.fx = fx; console.log(`  FX: ${Object.keys(fx.pairs).length} pairs (${fx.date})`); })
      .catch(e => errors.push('fx: ' + e.message)),
    fetchCrypto().then(c => { out.crypto = c; console.log(`  Crypto: ${Object.keys(c.quotes).length} tokens`); })
      .catch(e => errors.push('crypto: ' + e.message)),
    fetchBrvm().then(b => { out.stocks.BRVM = b; console.log(`  BRVM: ${Object.keys(b.quotes).length} quotes`); })
      .catch(e => errors.push('brvm: ' + e.message)),
  ]);
  Object.assign(out.stocks, await fetchYahooExchanges());

  if (errors.length) console.log('⚠️  Partial failures: ' + errors.join(' | '));
  const gotAnything = out.fx || out.crypto || Object.keys(out.stocks).length;
  if (!gotAnything) { console.error('❌ All sources failed — keeping previous file.'); process.exit(1); }

  mkdirSync(join(ROOT, 'data'), { recursive: true });
  const outPath = join(ROOT, 'data', 'market-live.json');
  writeFileSync(outPath, JSON.stringify(out, null, 1), 'utf-8');
  console.log(`✅ Saved → ${outPath}`);
}

main().catch(err => { console.error('❌ Fetch failed:', err.message); process.exit(1); });
