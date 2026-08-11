/**
 * WASI Legal & Legislative News Watch
 *
 * Sweeps daily news for each of the 54 countries, restricted to legislative
 * and regulatory activity (laws passed, decrees, parliament, investment
 * codes, nationalisations, states of emergency...), scores each item for
 * investment-relevant polarity, and produces a BOUNDED score adjustment
 * (-3..+3) that feeds the WASI country score alongside the World Bank macro
 * adjustment.
 *
 * Design constraints that matter:
 *  - Bounded: news can never swamp the structural score (±3 ceiling).
 *  - Auditable: every adjustment ships with the headlines that produced it,
 *    their source, date and matched keywords — the user can check our work.
 *  - Decayed: a three-month-old decree counts less than yesterday's.
 *  - Honest: a keyword lexicon is not comprehension. Items are labelled
 *    `classifier: "lexicon_v1"`; ambiguous items score 0 rather than guess.
 *
 * Source: Google News RSS (free, keyless). Query language follows the
 * country's dominant administrative language.
 *
 * Usage:
 *   node scripts/fetch-legal-news.mjs            # all countries
 *   node scripts/fetch-legal-news.mjs BF CI NG   # only these ISO2 codes
 *
 * Output: data/legal-news.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const UA = { 'User-Agent': 'Mozilla/5.0 (WASI legal news watch)' };

// Countries whose legislative record is published mainly in French; the rest
// are queried in English. Portuguese/Arabic states fall back to French or
// English, whichever their press mostly uses.
const FRENCH = new Set(['BF','CI','SN','ML','NE','TG','BJ','GN','GA','CM','CD','CG','CF','TD','DJ','KM','MG','MR','RW','BI','MA','TN','DZ','SC']);

const QUERY_TERMS = {
  fr: '(loi OR décret OR parlement OR "assemblée nationale" OR ordonnance OR "code des investissements" OR réglementation)',
  en: '(law OR decree OR parliament OR "national assembly" OR bill OR regulation OR "investment code")',
};

// ── Polarity lexicon ────────────────────────────────────────────────────────
// A legislative VERB alone says nothing about the investment climate — a
// parliament can pass an investment code or a repressive statute with the
// same verb. So a positive score requires an ACTION *and* an economically
// relevant SUBJECT. This is what stops "Parliament passes anti-LGBTQ+ bill"
// from reading as good news (in reality it cost Ghana World Bank funding).
const ACTIONS = {
  fr: ['adopte','adoptée','adopté','promulgue','promulgué','ratifie','ratifié','ratification','vote','voté','entre en vigueur','signe','signé'],
  en: ['adopts','adopted','passes','passed','enacts','enacted','ratifies','ratified','ratification','signs','signed','comes into force','approves','approved'],
};

// Economically relevant subject matter, with the weight it carries.
const ECON_SUBJECTS = {
  fr: [['code des investissements',2],['code minier',1.5],['loi de finances',1.5],['budget',1],['fiscal',1],
       ['fiscalité',1.2],['impôt',1],['douane',1.2],['commerce',1.2],['zlecaf',1.5],['partenariat public-privé',1.5],
       ['ppp',1.2],['banque',1],['bancaire',1.2],['assurance',1],['énergie',1],['électricité',1],['mines',1.2],
       ['hydrocarbures',1.2],['agriculture',1],['numérique',1],['télécom',1],['infrastructure',1.2],
       ['guichet unique',1.5],['incitations',1.2],['exonération',1.2],['ohada',1.2],['investisseurs',1.5],
       ['investissement',1.5],['privatisation',1],['concession',1.2],['libéralisation',1.5]],
  en: [['investment code',2],['mining code',1.5],['finance bill',1.5],['finance act',1.5],['budget',1],['tax',1],
       ['taxation',1.2],['customs',1.2],['trade',1.2],['afcfta',1.5],['public-private partnership',1.5],['ppp',1.2],
       ['bank',1],['banking',1.2],['insurance',1],['energy',1],['electricity',1],['mining',1.2],['petroleum',1.2],
       ['oil and gas',1.2],['agriculture',1],['digital',1],['telecom',1],['infrastructure',1.2],
       ['one-stop shop',1.5],['incentives',1.2],['exemption',1.2],['investor',1.5],['investment',1.5],
       ['privatisation',1],['privatization',1],['concession',1.2],['liberalisation',1.5],['liberalization',1.5]],
};

// Standalone positives that need no action verb — they are unambiguous.
const POSITIVE = {
  fr: [['protection des investisseurs',2],['lutte contre la corruption',1.2],['transparence',1],
       ['accord commercial',1.5],['facilitation des échanges',1.2],['simplification',1.2]],
  en: [['investor protection',2],['anti-corruption',1.2],['transparency',1],
       ['trade agreement',1.5],['trade facilitation',1.2],['streamlining',1.2]],
};

// Rights and press regressions. Beyond the human cost, these are concrete
// investment risks: donor suspensions, reputational exposure, sanctions.
const RIGHTS_REGRESSION = {
  fr: [['anti-lgbt',2],['homosexualité',1.8],['criminalise',1.8],['criminalisation',1.8],
       ['liberté de la presse',1.5],['journaliste emprisonné',1.8],['coupure d\'internet',1.8],
       ['peine de mort',1.5],['restreint les libertés',1.8],['dissout un parti',1.8]],
  en: [['anti-lgbt',2],['anti-gay',2],['homosexuality',1.8],['criminalis',1.8],['criminaliz',1.8],
       ['press freedom',1.5],['jailed journalist',1.8],['internet shutdown',1.8],['death penalty',1.5],
       ['restricts freedoms',1.8],['bans party',1.8]],
};

const NEGATIVE = {
  fr: [['nationalisation',2.5],['expropriation',2.5],['coup d\'état',3],['putsch',3],['état d\'urgence',2],
       ['gel des avoirs',2],['contrôle des changes',2],['sanctions',1.5],['suspension',1.2],['interdiction',1.2],
       ['dissolution',1.5],['report des élections',1.5],['retrait',1.2],['rupture',1.2],['expulsion',1.5],
       ['hausse des taxes',1.2],['révocation',1.5],['moratoire',1],['censure',1],['couvre-feu',1.5]],
  en: [['nationalisation',2.5],['nationalization',2.5],['expropriation',2.5],['coup',3],['state of emergency',2],
       ['asset freeze',2],['capital controls',2],['sanctions',1.5],['suspends',1.2],['ban',1.2],['banned',1.2],
       ['dissolves',1.5],['postpones elections',1.5],['withdraws',1.2],['expels',1.5],['tax hike',1.2],
       ['revoked',1.5],['moratorium',1],['curfew',1.5],['seizure',2]],
};

// Headlines about a FOREIGN legislature acting on the country are not that
// country's own legislative activity. Without this guard, "US House passes
// bill to halt Nigeria aid" scores positive on "passes"/"bill" — the exact
// wrong sign. Such items are dropped rather than guessed at.
const FOREIGN_ACTORS = [
  'us house', 'u.s. house', 'us senate', 'u.s. senate', 'us congress', 'congress',
  'european parliament', 'parlement européen', 'eu parliament', 'brussels',
  'uk parliament', 'house of commons', 'assemblée nationale française',
  'sénat français', 'bundestag', 'white house', 'maison blanche', 'kremlin',
];

// Terms that must dominate whatever else a headline contains.
const HARD_NEGATIVE = {
  fr: [['coup d\'état',3],['putsch',3],['junte',2],['suspension de l\'aide',2.5],['gel de l\'aide',2.5],
       ['massacre',2],['tueries',2],['répression',2],['arrestation',1.5],['expulse',1.5]],
  en: [['coup',3],['junta',2],['halt aid',2.5],['halts aid',2.5],['cut aid',2.5],['cuts aid',2.5],
       ['suspend aid',2.5],['killings',2],['massacre',2],['crackdown',2],['arrests',1.5],['expels',1.5]],
};

// Age decay — a decree from last week matters more than one from March.
function decay(ageDays) {
  if (ageDays <= 7) return 1;
  if (ageDays <= 21) return 0.7;
  if (ageDays <= 45) return 0.45;
  if (ageDays <= 90) return 0.25;
  return 0;
}

function readCountries() {
  const src = readFileSync(join(ROOT, 'index.html'), 'utf-8');
  const re = /\{code:'([A-Z]{2})',flag:'[^']*',name:"?'?([^",']+)"?'?,score:/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push({ code: m[1], name: m[2] });
  // Fallback for entries whose name uses double quotes (e.g. "Cote d'Ivoire")
  const re2 = /\{code:'([A-Z]{2})',flag:'[^']*',name:"([^"]+)",score:/g;
  while ((m = re2.exec(src)) !== null) {
    if (!out.some((c) => c.code === m[1])) out.push({ code: m[1], name: m[2] });
  }
  return out;
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').trim();
}

/** Minimal RSS item parser — avoids pulling in an XML dependency. */
function parseRssItems(xml) {
  const items = [];
  const blocks = xml.split('<item>').slice(1);
  for (const b of blocks) {
    const chunk = b.split('</item>')[0];
    const pick = (tag) => {
      const m = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? stripTags(m[1].replace(/<!\[CDATA\[|\]\]>/g, '')) : '';
    };
    const title = pick('title');
    if (!title) continue;
    items.push({
      title,
      link: pick('link'),
      pubDate: pick('pubDate'),
      source: pick('source') || 'Google News',
    });
  }
  return items;
}

function classify(title, lang) {
  const t = title.toLowerCase();

  // A foreign legislature acting on this country is not its own law-making.
  if (FOREIGN_ACTORS.some((a) => t.includes(a))) {
    return { score: 0, matched: ['skipped:foreign_actor'] };
  }

  let score = 0;
  const matched = [];

  // Hard negatives and rights regressions first: if present, no amount of
  // positive vocabulary may flip the sign.
  let hard = 0;
  for (const [term, w] of HARD_NEGATIVE[lang]) {
    if (t.includes(term)) { hard -= w; matched.push('!' + term); }
  }
  for (const [term, w] of RIGHTS_REGRESSION[lang]) {
    if (t.includes(term)) { hard -= w; matched.push('!' + term); }
  }

  // A positive reading requires a legislative action AND economic subject
  // matter — the verb alone is not a signal.
  const hasAction = ACTIONS[lang].some((a) => t.includes(a));
  if (hasAction) {
    let subjectWeight = 0;
    for (const [term, w] of ECON_SUBJECTS[lang]) {
      if (t.includes(term)) { subjectWeight = Math.max(subjectWeight, w); matched.push('+' + term); }
    }
    if (subjectWeight > 0) score += subjectWeight + 0.5;
  }

  for (const [term, w] of POSITIVE[lang]) {
    if (t.includes(term)) { score += w; matched.push('+' + term); }
  }
  for (const [term, w] of NEGATIVE[lang]) {
    if (t.includes(term)) { score -= w; matched.push('-' + term); }
  }

  if (hard < 0) score = Math.min(hard, hard + Math.max(0, score) * 0.3);
  return { score, matched };
}

/**
 * Bounded mapping from net signal to score points, capped at ±2 because a
 * keyword lexicon does not warrant more influence than that. Requires
 * corroboration: a single headline can never move a sovereign score.
 */
function toAdjustment(net, positives, negatives) {
  const corroborated = net > 0 ? positives >= 2 : negatives >= 2;
  if (!corroborated) return 0;
  if (net >= 3.5) return 2;
  if (net >= 1.5) return 1;
  if (net <= -3.5) return -2;
  if (net <= -1.5) return -1;
  return 0;
}

async function fetchCountry(country) {
  const lang = FRENCH.has(country.code) ? 'fr' : 'en';
  const q = encodeURIComponent(`"${country.name}" ${QUERY_TERMS[lang]}`);
  const hl = lang === 'fr' ? 'fr&gl=FR&ceid=FR:fr' : 'en&gl=US&ceid=US:en';
  const url = `https://news.google.com/rss/search?q=${q}&hl=${hl}`;

  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseRssItems(xml);

  const now = Date.now();
  const scored = [];
  let net = 0, positives = 0, negatives = 0, skippedForeign = 0;

  for (const it of items) {
    const when = it.pubDate ? new Date(it.pubDate) : null;
    if (!when || isNaN(when)) continue;
    const ageDays = Math.floor((now - when.getTime()) / 86400000);
    const d = decay(ageDays);
    if (!d) continue;

    const { score, matched } = classify(it.title, lang);
    if (matched[0] === 'skipped:foreign_actor') { skippedForeign++; continue; }
    if (!score) continue; // ambiguous — counted as neutral, not guessed at

    const contribution = score * d;
    net += contribution;
    if (score > 0) positives++; else negatives++;
    scored.push({
      title: it.title,
      source: it.source,
      date: when.toISOString().slice(0, 10),
      url: it.link,
      polarity: score > 0 ? 'positive' : 'negative',
      weight: +contribution.toFixed(2),
      matched: matched.slice(0, 4),
    });
  }

  // One story is syndicated across dozens of outlets — Ghana's anti-LGBTQ+
  // bill alone produced 40 matching headlines. Counting each as a separate
  // event would let press volume, not events, drive the score. Collapse
  // items sharing a primary keyword within the same ISO week, keeping the
  // strongest, so each distinct story contributes once.
  const clusters = new Map();
  for (const it of scored) {
    const week = it.date.slice(0, 4) + '-W' + Math.ceil(new Date(it.date).getDate() / 7);
    const key = it.polarity + '|' + (it.matched[0] || 'na') + '|' + week;
    const prev = clusters.get(key);
    if (!prev || Math.abs(it.weight) > Math.abs(prev.weight)) clusters.set(key, it);
  }
  const deduped = Array.from(clusters.values());

  const rawCount = scored.length;
  scored.length = 0;
  scored.push(...deduped);

  net = scored.reduce((s, it) => s + it.weight, 0);
  positives = scored.filter((it) => it.polarity === 'positive').length;
  negatives = scored.filter((it) => it.polarity === 'negative').length;

  scored.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  return {
    code: country.code,
    name: country.name,
    language: lang,
    classifier: 'lexicon_v1',
    items_scanned: items.length,
    items_scored: scored.length,
    items_before_dedup: rawCount,
    items_skipped_foreign_actor: skippedForeign,
    positives, negatives,
    net_signal: +net.toFixed(2),
    legalAdj: toAdjustment(net, positives, negatives),
    corroborated: (net > 0 ? positives : negatives) >= 2,
    evidence: scored.slice(0, 8),
    fetchedAt: new Date().toISOString(),
  };
}

async function main() {
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  const all = readCountries();
  const selected = only.length ? all.filter((c) => only.includes(c.code)) : all;

  console.log(`\nWASI Legal News Watch — ${new Date().toISOString()}`);
  console.log(`Countries: ${selected.length}/${all.length}\n`);
  if (!selected.length) { console.error('No matching countries.'); process.exit(1); }

  const countries = {};
  let moved = 0, failed = 0;

  for (const c of selected) {
    try {
      const r = await fetchCountry(c);
      countries[c.code] = r;
      if (r.legalAdj !== 0) moved++;
      const sign = r.legalAdj > 0 ? '+' + r.legalAdj : String(r.legalAdj);
      const flag = r.legalAdj > 0 ? '📈' : r.legalAdj < 0 ? '📉' : '  ';
      console.log(
        `${flag} ${c.code} ${c.name.padEnd(24)} adj ${sign.padStart(2)} ` +
        `(net ${String(r.net_signal).padStart(6)}, ${r.items_scored}/${r.items_scanned} retenus)` +
        (r.evidence[0] ? ` — ${r.evidence[0].title.slice(0, 60)}` : '')
      );
    } catch (err) {
      console.log(`⚠️  ${c.code} ${c.name}: ${err.message}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 1200)); // polite pacing
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'Google News RSS (legislative & regulatory query per country)',
    classifier: 'lexicon_v1',
    adjustment_range: [-2, 2],
    corroboration_rule: 'at least 2 headlines agreeing in sign, otherwise no adjustment',
    foreign_actor_guard: 'headlines about a foreign legislature acting on the country are excluded',
    window_days: 90,
    decay: '1.0 <=7d, 0.7 <=21d, 0.45 <=45d, 0.25 <=90d, 0 beyond',
    note: 'Keyword lexicon, not comprehension. Ambiguous headlines score 0. Every adjustment lists the headlines behind it.',
    countries,
  };

  mkdirSync(join(ROOT, 'data'), { recursive: true });
  const outPath = join(ROOT, 'data', 'legal-news.json');
  writeFileSync(outPath, JSON.stringify(output, null, 1), 'utf-8');

  console.log(`\n✅ ${Object.keys(countries).length} pays · ${moved} avec ajustement non nul · ${failed} échecs`);
  console.log(`📁 Saved → ${outPath}`);
}

main().catch((err) => { console.error('\n❌ Failed:', err.message); process.exit(1); });
