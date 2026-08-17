const subfamilies = [
  {
    code: "NAEX",
    name: "Famille d'indices d'exportation — Afrique du Nord",
    color: "#b45309",
    countries: [
      { code: "ALGEX", country: "Algérie", currency: "DZD", model: "coastal_export_model", role: "energy_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Condensats", "Minerai de fer", "Phosphates"] },
      { code: "EGYEX", country: "Égypte", currency: "EGP", model: "coastal_export_model", role: "diversified_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Or", "Coton brut", "Phosphates"] },
      { code: "LBYEX", country: "Libye", currency: "LYD", model: "coastal_export_model", role: "energy_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Condensats", "Charges pétrochimiques"] },
      { code: "MAREX", country: "Maroc", currency: "MAD", model: "coastal_export_model", role: "diversified_coastal_member", detail: "starter_profile", commodities: ["Phosphates", "Poissons et fruits de mer", "Agrumes", "Concentrés de plomb et de zinc"] },
      { code: "TUNEX", country: "Tunisie", currency: "TND", model: "coastal_export_model", role: "coastal_diversified_member", detail: "starter_profile", commodities: ["Huile d'olive", "Phosphates", "Pétrole brut", "Dattes"] },
      { code: "SUDEX", country: "Soudan", currency: "SDG", model: "coastal_export_model", role: "agri_and_minerals_member", detail: "starter_profile", commodities: ["Or", "Gomme arabique", "Bétail", "Graines de sésame", "Coton brut"] }
    ]
  },
  {
    code: "WAEX",
    name: "Famille d'indices d'exportation — Afrique de l'Ouest",
    color: "#2c884b",
    countries: [
      { code: "BENEX", country: "Bénin", currency: "XOF", model: "coastal_export_model", role: "coastal_corridor_member", detail: "starter_profile", commodities: ["Coton brut", "Noix de cajou", "Soja", "Noix de karité"] },
      { code: "BUREX", country: "Burkina Faso", currency: "XOF", model: "landlocked_corridor_model", role: "landlocked_corridor_member", detail: "detailed_prototype_ready", commodities: ["Autres graines oléagineuses", "Noix de cajou", "Coton brut", "Graines de sésame", "Minerai de zinc", "Or"] },
      { code: "CABEX", country: "Cap-Vert", currency: "CVE", model: "island_export_model", role: "island_member", detail: "starter_profile", commodities: ["Poissons et fruits de mer", "Sel", "Produits de la mer"] },
      { code: "CIREX", country: "Côte d'Ivoire", currency: "XOF", model: "coastal_export_model", role: "coastal_anchor_member", detail: "detailed_prototype_ready", commodities: ["Fèves de cacao", "Caoutchouc naturel", "Noix de cajou", "Pétrole brut", "Manganèse", "Huile de palme", "Coton brut", "Café", "Nickel", "Or", "Diamants"] },
      { code: "GMBEX", country: "Gambie", currency: "GMD", model: "coastal_export_model", role: "river_coastal_member", detail: "starter_profile", commodities: ["Arachides", "Poissons et fruits de mer", "Graines de sésame", "Noix de cajou"] },
      { code: "GHAEX", country: "Ghana", currency: "GHS", model: "coastal_export_model", role: "coastal_anchor_member", detail: "starter_profile", commodities: ["Fèves de cacao", "Or", "Pétrole brut", "Manganèse", "Bauxite", "Bois"] },
      { code: "GUIEX", country: "Guinée", currency: "GNF", model: "coastal_export_model", role: "minerals_anchor_member", detail: "starter_profile", commodities: ["Bauxite", "Or", "Diamants", "Minerai de fer"] },
      { code: "GNBEX", country: "Guinée-Bissau", currency: "XOF", model: "coastal_export_model", role: "single_crop_member", detail: "starter_profile", commodities: ["Noix de cajou", "Poissons et fruits de mer", "Arachides"] },
      { code: "LIBEX", country: "Liberia", currency: "LRD", model: "coastal_export_model", role: "minerals_and_agriculture_member", detail: "starter_profile", commodities: ["Caoutchouc naturel", "Minerai de fer", "Or", "Huile de palme", "Bois"] },
      { code: "MALIEX", country: "Mali", currency: "XOF", model: "landlocked_corridor_model", role: "landlocked_corridor_member", detail: "starter_profile", commodities: ["Or", "Coton brut", "Bétail", "Graines de sésame", "Noix de karité"] },
      { code: "MRTEX", country: "Mauritanie", currency: "MRU", model: "coastal_export_model", role: "minerals_and_fisheries_member", detail: "starter_profile", commodities: ["Minerai de fer", "Or", "Concentré de cuivre", "Poissons et fruits de mer"] },
      { code: "NEREX", country: "Niger", currency: "XOF", model: "landlocked_corridor_model", role: "landlocked_corridor_member", detail: "starter_profile", commodities: ["Uranium", "Pétrole brut", "Bétail", "Niébé", "Oignons"] },
      { code: "NGAEX", country: "Nigeria", currency: "NGN", model: "coastal_export_model", role: "energy_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Fèves de cacao", "Graines de sésame", "Caoutchouc naturel"] },
      { code: "SENEX", country: "Sénégal", currency: "XOF", model: "coastal_export_model", role: "coastal_diversified_member", detail: "starter_profile", commodities: ["Phosphates", "Or", "Poissons et fruits de mer", "Arachides", "Zircon"] },
      { code: "SLEX", country: "Sierra Leone", currency: "SLE", model: "coastal_export_model", role: "minerals_member", detail: "starter_profile", commodities: ["Diamants", "Minerai de fer", "Rutile", "Bauxite", "Cacao"] },
      { code: "TOGEX", country: "Togo", currency: "XOF", model: "coastal_export_model", role: "coastal_corridor_member", detail: "starter_profile", commodities: ["Phosphates", "Coton brut", "Soja", "Noix de cajou"] }
    ]
  },
  {
    code: "CAEX",
    name: "Famille d'indices d'exportation — Afrique centrale",
    color: "#7c3aed",
    countries: [
      { code: "CAMEX", country: "Cameroun", currency: "XAF", model: "coastal_export_model", role: "diversified_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Fèves de cacao", "Bois", "Coton brut", "Café", "Gaz naturel"] },
      { code: "CAFEX", country: "République centrafricaine", currency: "XAF", model: "landlocked_corridor_model", role: "minerals_and_forest_member", detail: "starter_profile", commodities: ["Bois", "Or", "Diamants", "Coton brut"] },
      { code: "CHAEX", country: "Tchad", currency: "XAF", model: "landlocked_corridor_model", role: "energy_and_livestock_member", detail: "starter_profile", commodities: ["Pétrole brut", "Bétail", "Graines de sésame", "Gomme arabique", "Coton brut"] },
      { code: "COGEX", country: "République du Congo", currency: "XAF", model: "coastal_export_model", role: "energy_member", detail: "starter_profile", commodities: ["Pétrole brut", "Bois", "Minerai de fer", "Potasse"] },
      { code: "DRCEX", country: "République démocratique du Congo", currency: "CDF", model: "landlocked_corridor_model", role: "minerals_anchor_member", detail: "starter_profile", commodities: ["Cuivre", "Cobalt", "Or", "Minerai d'étain", "Coltan", "Diamants"] },
      { code: "EQGEX", country: "Guinée équatoriale", currency: "XAF", model: "coastal_export_model", role: "energy_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Méthanol", "Bois", "Fèves de cacao"] },
      { code: "GABEX", country: "Gabon", currency: "XAF", model: "coastal_export_model", role: "energy_and_metals_member", detail: "starter_profile", commodities: ["Pétrole brut", "Manganèse", "Bois", "Or"] },
      { code: "STPEX", country: "Sao Tomé-et-Principe", currency: "STN", model: "island_export_model", role: "island_member", detail: "starter_profile", commodities: ["Fèves de cacao", "Poissons et fruits de mer", "Produits du palmier"] }
    ]
  },
  {
    code: "EAEX",
    name: "Famille d'indices d'exportation — Afrique de l'Est",
    color: "#0284c7",
    countries: [
      { code: "BDIEX", country: "Burundi", currency: "BIF", model: "landlocked_corridor_model", role: "agri_and_minerals_member", detail: "starter_profile", commodities: ["Café", "Thé", "Or", "Minerai de nickel"] },
      { code: "COMREX", country: "Comores", currency: "KMF", model: "island_export_model", role: "island_member", detail: "starter_profile", commodities: ["Vanille", "Clous de girofle", "Ylang-ylang", "Poissons et fruits de mer"] },
      { code: "DJIEX", country: "Djibouti", currency: "DJF", model: "coastal_export_model", role: "trade_gateway_member", detail: "starter_profile", commodities: ["Sel", "Bétail", "Poissons et fruits de mer"] },
      { code: "ERIEX", country: "Érythrée", currency: "ERN", model: "coastal_export_model", role: "metals_member", detail: "starter_profile", commodities: ["Or", "Cuivre", "Zinc", "Potasse", "Sel"] },
      { code: "ETHEX", country: "Éthiopie", currency: "ETB", model: "landlocked_corridor_model", role: "agri_anchor_member", detail: "starter_profile", commodities: ["Café", "Or", "Graines de sésame", "Graines oléagineuses", "Bétail"] },
      { code: "KENEX", country: "Kenya", currency: "KES", model: "coastal_export_model", role: "diversified_anchor_member", detail: "starter_profile", commodities: ["Thé", "Café", "Carbonate de sodium", "Minerai de titane", "Fleurs coupées"] },
      { code: "RWAEX", country: "Rwanda", currency: "RWF", model: "landlocked_corridor_model", role: "minerals_and_agri_member", detail: "starter_profile", commodities: ["Or", "Minerai d'étain", "Tantale", "Tungstène", "Café", "Thé"] },
      { code: "SOMEX", country: "Somalie", currency: "SOS", model: "coastal_export_model", role: "livestock_member", detail: "starter_profile", commodities: ["Bétail", "Graines de sésame", "Encens", "Poissons et fruits de mer"] },
      { code: "SSDEX", country: "Soudan du Sud", currency: "SSP", model: "landlocked_corridor_model", role: "energy_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gomme arabique", "Bétail", "Graines de sésame"] },
      { code: "TZAEX", country: "Tanzanie", currency: "TZS", model: "coastal_export_model", role: "diversified_anchor_member", detail: "starter_profile", commodities: ["Or", "Noix de cajou", "Café", "Coton brut", "Tabac", "Gaz naturel"] },
      { code: "UGAEX", country: "Ouganda", currency: "UGX", model: "landlocked_corridor_model", role: "agri_anchor_member", detail: "starter_profile", commodities: ["Café", "Or", "Coton brut", "Thé", "Poissons et fruits de mer"] }
    ]
  },
  {
    code: "SAEX",
    name: "Famille d'indices d'exportation — Afrique australe",
    color: "#dc2626",
    countries: [
      { code: "ANGEX", country: "Angola", currency: "AOA", model: "coastal_export_model", role: "energy_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Diamants", "Minerai de fer", "Café"] },
      { code: "BOTEX", country: "Botswana", currency: "BWP", model: "landlocked_corridor_model", role: "diamonds_member", detail: "starter_profile", commodities: ["Diamants", "Cuivre", "Nickel", "Carbonate de sodium", "Viande bovine"] },
      { code: "ESWEX", country: "Eswatini", currency: "SZL", model: "landlocked_corridor_model", role: "agri_industrial_member", detail: "starter_profile", commodities: ["Sucre", "Pâte à papier", "Agrumes", "Charbon"] },
      { code: "LESEX", country: "Lesotho", currency: "LSL", model: "landlocked_corridor_model", role: "small_minerals_member", detail: "starter_profile", commodities: ["Laine", "Mohair", "Diamants"] },
      { code: "MDGEX", country: "Madagascar", currency: "MGA", model: "island_export_model", role: "agri_and_minerals_member", detail: "starter_profile", commodities: ["Vanille", "Nickel et cobalt", "Clous de girofle", "Minerai de chrome", "Ilménite"] },
      { code: "MWIEX", country: "Malawi", currency: "MWK", model: "landlocked_corridor_model", role: "agri_member", detail: "starter_profile", commodities: ["Tabac", "Thé", "Sucre", "Noix de macadamia"] },
      { code: "MUSEX", country: "Maurice", currency: "MUR", model: "island_export_model", role: "island_member", detail: "starter_profile", commodities: ["Sucre", "Poissons et fruits de mer", "Mélasse"] },
      { code: "MOZEX", country: "Mozambique", currency: "MZN", model: "coastal_export_model", role: "energy_and_mining_member", detail: "starter_profile", commodities: ["Charbon", "Gaz naturel", "Graphite", "Sables minéralisés lourds", "Aluminium"] },
      { code: "NAMEX", country: "Namibie", currency: "NAD", model: "coastal_export_model", role: "minerals_member", detail: "starter_profile", commodities: ["Diamants", "Uranium", "Zinc", "Cuivre", "Poissons et fruits de mer"] },
      { code: "SEYEX", country: "Seychelles", currency: "SCR", model: "island_export_model", role: "island_member", detail: "starter_profile", commodities: ["Poissons et fruits de mer", "Thon", "Cannelle", "Vanille"] },
      { code: "ZAFEX", country: "Afrique du Sud", currency: "ZAR", model: "coastal_export_model", role: "continental_anchor_member", detail: "starter_profile", commodities: ["Or", "Métaux du groupe platine", "Charbon", "Minerai de fer", "Manganèse", "Chrome"] },
      { code: "ZMBEX", country: "Zambie", currency: "ZMW", model: "landlocked_corridor_model", role: "copper_anchor_member", detail: "starter_profile", commodities: ["Cuivre", "Cobalt", "Émeraudes", "Sucre"] },
      { code: "ZIMEX", country: "Zimbabwe", currency: "ZWG", model: "landlocked_corridor_model", role: "minerals_anchor_member", detail: "starter_profile", commodities: ["Or", "Platine", "Lithium", "Tabac", "Nickel"] }
    ]
  }
];
const WASI_MARKET_TICKER = [
  { symbol: "SAPH", price: "3 800 XOF", change: -1.2 },
  { symbol: "PALC", price: "4 150 XOF", change: 0.3 },
  { symbol: "SIFC", price: "4 700 XOF", change: 1.8 },
  { symbol: "ONTBF", price: "7 100 XOF", change: -0.5 },
  { symbol: "BOAB", price: "5 900 XOF", change: 0.9 },
  { symbol: "CBIBF", price: "8 450 XOF", change: 2.4 },
  { symbol: "TTLC", price: "2 150 XOF", change: -0.3 },
  { symbol: "SLBC", price: "12 800 XOF", change: 0.7 }
];

const allCountries = subfamilies.flatMap((sf) => sf.countries);
const totalCountries = allCountries.length;
const detailedCount = allCountries.filter((c) => c.detail === "detailed_prototype_ready").length;
const starterCount = totalCountries - detailedCount;
const uniqueCommodities = new Set(allCountries.flatMap((c) => c.commodities)).size;
const coastalCount = allCountries.filter((c) => c.model === "coastal_export_model").length;
const landlockedCount = allCountries.filter((c) => c.model === "landlocked_corridor_model").length;
const islandCount = allCountries.filter((c) => c.model === "island_export_model").length;
const uniqueCurrencies = new Set(allCountries.map((c) => c.currency)).size;
const largestSubfamily = subfamilies.reduce((largest, current) => current.countries.length > largest.countries.length ? current : largest, subfamilies[0]);
const commodityFrequency = Object.entries(
  allCountries.reduce((acc, country) => {
    country.commodities.forEach((commodity) => {
      acc[commodity] = (acc[commodity] || 0) + 1;
    });
    return acc;
  }, {})
).sort((a, b) => b[1] - a[1]);

renderMarketTicker();

const stats = [
  { label: "Code famille", value: "AFEX", note: "Chapeau continental de la famille d'indices d'exportation", meta: "Couche socle", tone: "accent" },
  { label: "Pays", value: String(totalCountries), note: "54 États africains souverains", meta: "Couverture complète", tone: "green" },
  { label: "Sous-familles", value: "5", note: "NAEX, WAEX, CAEX, EAEX, SAEX", meta: "Maillage régional", tone: "blue" },
  { label: "Prototypes détaillés", value: String(detailedCount), note: "Paquets pays prioritaires à la logique plus riche", meta: "Constructions approfondies", tone: "accent" },
  { label: "Profils initiaux", value: String(starterCount), note: "Modèles pays prêts pour validation complémentaire", meta: "File d'expansion", tone: "purple" },
  { label: "Matières suivies", value: String(uniqueCommodities), note: "Matières premières distinctes sur l'ensemble des fonds", meta: "Éventail des matières", tone: "green" },
  { label: "Devises", value: String(uniqueCurrencies), note: "Devises de référence sur l'ensemble des pays", meta: "Carte monétaire", tone: "blue" },
  { label: "Devise de comparaison", value: "USD", note: "Couche de comparaison à l'échelle du continent", meta: "Référence commune", tone: "purple" }
];

document.getElementById("stats-grid").innerHTML = stats.map((item) => `
  <article class="stat-card tone-${item.tone}">
    <div class="eyebrow">${item.label}</div>
    <div class="stat-value">${item.value}</div>
    <div class="muted small-text">${item.note}</div>
    <div class="stat-meta">${item.meta}</div>
  </article>
`).join("");

function renderMarketTicker() {
  const primary = document.getElementById("wasi-market-ticker-track");
  const secondary = document.getElementById("wasi-market-ticker-track-secondary");
  const html = WASI_MARKET_TICKER.map(
    (item) =>
      `<span class="wasi-market-ticker-item"><span class="sym">${item.symbol}</span><span class="val">${item.price}</span><span class="${item.change >= 0 ? "pos" : "neg"}">${item.change >= 0 ? "+" : ""}${item.change.toFixed(1)}%</span></span>`,
  ).join("");
  if (primary) {
    primary.innerHTML = `${html}${html}`;
  }
  if (secondary) {
    secondary.innerHTML = `${html}${html}`;
  }
}

document.getElementById("family-pulse").innerHTML = `
  <div class="section-head">
    <div>
      <div class="eyebrow">Family Pulse</div>
      <h2>Regional weight and operating posture</h2>
      <p>See where the largest country coverage sits, how many packages are deep enough to open immediately, and where the family is still mostly starter-grade.</p>
    </div>
  </div>
  <div class="signal-matrix">
    <article class="signal-panel">
      <div class="eyebrow">Largest subfamily</div>
      <strong>${largestSubfamily.code}</strong>
      <div class="muted">${largestSubfamily.countries.length} countries in the broadest regional block.</div>
    </article>
    <article class="signal-panel">
      <div class="eyebrow">Detailed depth</div>
      <strong>${detailedCount}/${totalCountries}</strong>
      <div class="muted">${formatWholePercent((detailedCount / totalCountries) * 100)} of the library already has richer prototype logic.</div>
    </article>
    <article class="signal-panel">
      <div class="eyebrow">Starter queue</div>
      <strong>${starterCount}</strong>
      <div class="muted">Country files still waiting for deeper package treatment and review.</div>
    </article>
  </div>
  <div class="pulse-list">
    ${subfamilies.map((sf) => {
      const share = (sf.countries.length / totalCountries) * 100;
      return `
        <div class="pulse-row">
          <div class="pulse-head">
            <strong>${sf.code}</strong>
            <span class="muted">${sf.countries.length} countries · ${formatWholePercent(share)}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${share}%; background: linear-gradient(90deg, ${sf.color}, rgba(79, 136, 255, 0.78));"></div>
          </div>
        </div>
      `;
    }).join("")}
  </div>
`;

document.getElementById("model-distribution").innerHTML = `
  <div class="section-head">
    <div>
      <div class="eyebrow">Method Mix</div>
      <h2>Transport logic and recurring export themes</h2>
      <p>The AFEX family leans coastal overall, but the corridor and island models remain essential for the continent-wide picture.</p>
    </div>
  </div>
  <div class="distribution-stack">
    ${[
      { name: "Coastal export model", count: coastalCount, color: "#4f88ff" },
      { name: "Landlocked corridor model", count: landlockedCount, color: "#c8922a" },
      { name: "Island export model", count: islandCount, color: "#7c3aed" }
    ].map((item) => {
      const share = (item.count / totalCountries) * 100;
      return `
        <div class="distribution-row">
          <div class="distribution-head">
            <span>${item.name}</span>
            <strong>${item.count} · ${formatWholePercent(share)}</strong>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${share}%; background: linear-gradient(90deg, ${item.color}, rgba(255, 255, 255, 0.18));"></div>
          </div>
        </div>
      `;
    }).join("")}
  </div>
  <div class="overview-stack">
    <div>
      <div class="eyebrow">Most repeated commodities</div>
      <div class="pill-row">
        ${commodityFrequency.slice(0, 8).map(([commodity, count]) => `<span class="pill soft">${commodity} · ${count}</span>`).join("")}
      </div>
    </div>
    <div>
      <div class="eyebrow">Design reading</div>
      <p>The current family is strongest where port exports dominate, while corridor and island models act as the specialization layer that keeps the library realistic across inland and archipelago markets.</p>
    </div>
  </div>
`;

const familyTags = ["54 sovereign states", "USD comparison layer", "5 regional subfamilies", "3 methodology models", "Country benchmarks", "WASI-ready packages", "Rules-based index tracking"];
document.getElementById("family-tags").innerHTML = familyTags.map((tag) => `
  <span class="pill">${tag}</span>
`).join("");

document.getElementById("subfamily-grid").innerHTML = subfamilies.map((sf) => `
  <article class="mini-card" style="border-left: 4px solid ${sf.color}">
    <div class="code-chip" style="background: ${sf.color}">${sf.code}</div>
    <strong>${sf.name}</strong>
    <div class="muted">${sf.countries.length} countries</div>
  </article>
`).join("");

const modules = [
  {
    name: "Microfinance Operations",
    status: "ready",
    summary: "Daily operations layer for clients, loans, savings, branches, scoring, and receipts.",
    bullets: ["Offline browser app", "Local pilot operations", "Receipts and score flows"],
    href: "../microfinance-app/index.html",
    cta: "Open app"
  },
  {
    name: "WASI DEX Intelligence Platform",
    status: "ready",
    summary: "The main terminal for all 54 AFEX instruments with search, comparison, and export-package access.",
    bullets: ["54 instruments indexed", "Grid, table, and compare views", "Package access from one terminal"],
    href: "../wasi-dex/index.html",
    cta: "Open WASI DEX"
  },
  {
    name: "Upload Packages",
    status: "ready",
    summary: "Machine-readable JSON, Markdown, and bundle outputs that feed the wider WASI stack.",
    bullets: ["AFEX manifest", "Detailed prototype bundles", "Country package folders"],
    href: "../wasi-upload/afex_all54_manifest.md",
    cta: "Open manifest"
  },
  {
    name: "Tokenization and Rails",
    status: "future",
    summary: "Future CBDC, tokenization, and programmable settlement layer around the fund family.",
    bullets: ["Comes after compliant fund setup", "Wraps the legal vehicle instead of replacing it", "Best added once live data is stable"],
    href: "",
    cta: "Planned"
  }
];

document.getElementById("modules-grid").innerHTML = modules.map((item) => `
  <article class="card">
    <div class="status ${item.status}">${labelStatus(item.status)}</div>
    <h3>${item.name}</h3>
    <p>${item.summary}</p>
    <div class="pill-row">${item.bullets.map((b) => `<span class="pill soft">${b}</span>`).join("")}</div>
    <div class="action-row">${item.href ? `<a class="secondary-btn" href="${item.href}">${item.cta}</a>` : `<span class="secondary-btn disabled">${item.cta}</span>`}</div>
  </article>
`).join("");

// Region filter and country grid
let activeRegion = "all";
let regionSearchTerm = "";

function matchesCountrySearch(country) {
  const query = regionSearchTerm.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    country.code,
    country.country,
    country.currency,
    formatModel(country.model),
    formatRole(country.role),
    ...country.commodities
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function getCountryLinks(country) {
  const code = country.code.toLowerCase();

  if (country.code === "CIREX") {
    return {
      json: "../wasi-upload/cirex_fund_characteristics.json",
      md: "../wasi-upload/cirex_fund_characteristics.md",
      zip: "../wasi-upload/cirex_wasi_upload_package.zip"
    };
  }

  if (country.code === "BUREX") {
    return {
      json: "../wasi-upload-burex/burex_fund_characteristics.json",
      md: "../wasi-upload-burex/burex_fund_characteristics.md",
      zip: "../wasi-upload-burex/burex_wasi_upload_package.zip"
    };
  }

  return {
    json: `../wasi-upload/${code}/${code}_fund_characteristics.json`,
    md: `../wasi-upload/${code}/${code}_fund_characteristics.md`,
    zip: ""
  };
}

function renderRegionFilter() {
  const el = document.getElementById("region-filter");
  const buttons = [{ code: "all", label: "All 54", color: "var(--accent)" }];
  subfamilies.forEach((sf) => buttons.push({ code: sf.code, label: `${sf.code} (${sf.countries.length})`, color: sf.color }));
  el.innerHTML = buttons.map((btn) => `
    <button class="region-btn ${activeRegion === btn.code ? "active" : ""}" data-region="${btn.code}" style="--btn-color: ${btn.color}">${btn.label}</button>
  `).join("");
  el.querySelectorAll(".region-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeRegion = btn.dataset.region;
      renderRegionFilter();
      renderRegionContainer();
    });
  });
}

function renderRegionContainer() {
  const el = document.getElementById("region-container");
  const regions = activeRegion === "all" ? subfamilies : subfamilies.filter((sf) => sf.code === activeRegion);
  const blocks = regions.map((sf) => {
    const visibleCountries = sf.countries.filter(matchesCountrySearch);
    if (!visibleCountries.length) return "";

    return `
    <div class="region-block">
      <div class="region-header" style="border-color: ${sf.color}">
        <span class="code-chip" style="background: ${sf.color}">${sf.code}</span>
        <strong>${sf.name}</strong>
        <span class="muted">${visibleCountries.length} ${visibleCountries.length > 1 ? "countries" : "country"} visible</span>
      </div>
      <div class="country-grid">
        ${visibleCountries.map((c) => {
          const links = getCountryLinks(c);
          return `
          <article class="country-card ${c.detail === "detailed_prototype_ready" ? "detailed" : ""}">
            <div class="country-topline">
              <div class="code-chip small">${c.code}</div>
              ${c.detail === "detailed_prototype_ready" ? '<span class="detail-badge">Detailed</span>' : ""}
            </div>
            <strong>${c.country}</strong>
            <div class="country-meta">
              <div>${c.currency} · ${formatModel(c.model)}</div>
              <div>${formatRole(c.role)}</div>
            </div>
            <div class="commodity-pills">
              ${c.commodities.slice(0, 3).map((com) => `<span class="commodity-pill">${com}</span>`).join("")}
              ${c.commodities.length > 3 ? `<span class="commodity-pill more">+${c.commodities.length - 3}</span>` : ""}
            </div>
            <div class="action-row compact">
              <a class="secondary-btn small-btn" href="${links.json}">JSON</a>
              <a class="secondary-btn small-btn" href="${links.md}">Notes</a>
              ${links.zip ? `<a class="secondary-btn small-btn" href="${links.zip}">ZIP</a>` : ""}
            </div>
          </article>
        `;
        }).join("")}
      </div>
    </div>
  `;
  }).join("");

  el.innerHTML = blocks || `
    <div class="empty-state">
      <div>
        <strong>Aucun pays ne correspond à cette recherche.</strong>
        <div class="muted">Essayez un nom de pays, un code, une matière, une devise ou un modèle méthodologique.</div>
      </div>
    </div>
  `;
}

renderRegionFilter();
renderRegionContainer();
document.getElementById("region-search").addEventListener("input", (event) => {
  regionSearchTerm = event.target.value;
  renderRegionContainer();
});

// Detailed prototypes (CIREX and BUREX)
const detailedFunds = [
  {
    code: "CIREX",
    name: "Indice d'exportation brute — Côte d'Ivoire",
    country: "Côte d'Ivoire",
    role: "Ancre côtière",
    status: "building",
    summary: "Référence d'exportation côtière centrée sur les matières premières sortant par le système d'exportation du pays.",
    transportModel: "Logique de chargement maritime et de tonnage à l'export",
    uploadJson: "../wasi-upload/cirex_fund_characteristics.json",
    uploadMd: "../wasi-upload/cirex_fund_characteristics.md",
    notes: [
      "Designed for a port-led export economy",
      "Prototype weights already prepared",
      "Idéal pour une exposition côtière aux matières tirée par le cacao"
    ],
    weights: [
      { name: "Fèves de cacao", weight: 33.9 },
      { name: "Caoutchouc naturel", weight: 19.26 },
      { name: "Noix de cajou", weight: 15.1 },
      { name: "Pétrole brut", weight: 11.71 },
      { name: "Minerai de manganèse", weight: 7.86 }
    ]
  },
  {
    code: "BUREX",
    name: "Indice d'exportation brute — Burkina Faso",
    country: "Burkina Faso",
    role: "Membre de corridor enclavé",
    status: "building",
    summary: "Référence d'exportation enclavée construite autour du tonnage sortant qui transite par les corridors régionaux et les relations frontalières.",
    transportModel: "Road, rail, air, and transit corridor tonnage",
    uploadJson: "../wasi-upload-burex/burex_fund_characteristics.json",
    uploadMd: "../wasi-upload-burex/burex_fund_characteristics.md",
    corridorCountries: ["Ghana", "Togo", "Bénin", "Côte d'Ivoire", "Mali", "Niger"],
    notes: [
      "Conçu pour le commerce de corridor plutôt que pour le chargement maritime",
      "Gold dominates value but not tonnage",
      "Suit explicitement le recouvrement de corridor sur six pays"
    ],
    weights: [
      { name: "Autres graines oléagineuses", weight: 41.94 },
      { name: "Noix de cajou", weight: 25.26 },
      { name: "Coton brut", weight: 24.52 },
      { name: "Graines de sésame", weight: 8.24 },
      { name: "Minerai de zinc", weight: 0.04 }
    ]
  }
];

document.getElementById("fund-grid").innerHTML = detailedFunds.map((fund) => `
  <article class="fund-card">
    <div class="fund-topline">
      <div>
        <div class="code-chip">${fund.code}</div>
        <h3>${fund.name}</h3>
      </div>
      <div class="status ${fund.status}">${labelStatus(fund.status)}</div>
    </div>
    <p>${fund.summary}</p>
    <div class="metric-list">
      <div class="metric-row"><span>Pays</span><strong>${fund.country}</strong></div>
      <div class="metric-row"><span>Rôle dans la famille</span><strong>${fund.role}</strong></div>
      <div class="metric-row"><span>Modèle de transport</span><strong>${fund.transportModel}</strong></div>
      <div class="metric-row"><span>Top weight</span><strong>${fund.weights[0].name} ${formatPercent(fund.weights[0].weight)}</strong></div>
    </div>
    ${fund.corridorCountries ? `<div class="sub-block"><div class="eyebrow">Pays du corridor</div><div class="pill-row">${fund.corridorCountries.map((c) => `<span class="pill soft">${c}</span>`).join("")}</div></div>` : ""}
    <div class="sub-block">
      <div class="eyebrow">Points clés</div>
      <ul>${fund.notes.map((note) => `<li>${note}</li>`).join("")}</ul>
    </div>
    <div class="sub-block">
      <div class="eyebrow">Top weights</div>
      <div class="weight-stack">
        ${fund.weights.map((item) => `
          <div class="weight-row">
            <div class="weight-head"><span>${item.name}</span><strong>${formatPercent(item.weight)}</strong></div>
            <div class="weight-track"><div class="weight-fill" style="width:${Math.max(item.weight, 1)}%"></div></div>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="action-row">
      <a class="secondary-btn" href="${fund.uploadJson}">Ouvrir le JSON</a>
      <a class="secondary-btn" href="${fund.uploadMd}">Ouvrir le Markdown</a>
    </div>
  </article>
`).join("");

// Architecture
const familyMap = [
  { title: "1. AFEX umbrella", body: "One continental family name for 54 sovereign country export-index funds with shared documentation, governance rules, and USD comparison." },
  { title: "2. Five subfamilies", body: "NAEX (North), WAEX (West), CAEX (Central), EAEX (East), SAEX (Southern) — each with its own regional comparison currency where applicable." },
  { title: "3. Three methodology models", body: "Coastal export model for port-led economies, landlocked corridor model for border-trade economies, and island export model for maritime/air flows." },
  { title: "4. Spécialisation par pays", body: "Chaque pays conserve sa méthodologie d'exportation, sa pondération et son univers de matières candidates, tout en restant aligné sur l'architecture de la famille." },
  { title: "5. Shared governance", body: "Every fund stays separate legally, but the methodology framework, risk language, upload format, and naming rules remain aligned continent-wide." }
];

document.getElementById("family-map").innerHTML = familyMap.map((item) => `
  <article class="card"><strong>${item.title}</strong><div class="muted">${item.body}</div></article>
`).join("");

// Methodology models
const methodologyModels = [
  {
    name: "Modèle d'exportation côtier",
    count: coastalCount,
    description: "Utilise le tonnage sortant sur les flux d'exportation portuaires et les statistiques commerciales officielles.",
    examples: "CIREX, ALGEX, EGYEX, NGAEX, KENEX, ZAFEX"
  },
  {
    name: "Modèle de corridor enclavé",
    count: landlockedCount,
    description: "Use outbound export tonnage across road, rail, air, border-post, and transit-corridor flows rather than seaborne loading.",
    examples: "BUREX, ETHEX, MALIEX, DRCEX, ZMBEX, ZIMEX"
  },
  {
    name: "Modèle d'exportation insulaire",
    count: islandCount,
    description: "Utilise le tonnage sortant sur les flux maritimes et aériens, avec une alerte de diversification explicite lorsque la base de matières premières est étroite.",
    examples: "CABEX, STPEX, COMREX, MDGEX, MUSEX, SEYEX"
  }
];

document.getElementById("methodology-grid").innerHTML = methodologyModels.map((m) => `
  <article class="compare-card">
    <h3>${m.name}</h3>
    <div class="stat-value">${m.count}</div>
    <div class="muted">countries</div>
    <p>${m.description}</p>
    <div class="pill-row">${m.examples.split(", ").map((item) => `<span class="pill soft">${item}</span>`).join("")}</div>
  </article>
`).join("");

// Upload center
const uploadPackages = [
  {
    name: "Manifeste AFEX — les 54",
    summary: "Manifeste maître pour l'ensemble de la bibliothèque des 54 pays.",
    links: [
      { label: "JSON", href: "../wasi-upload/afex_all54_manifest.json" },
      { label: "Markdown", href: "../wasi-upload/afex_all54_manifest.md" }
    ]
  },
  {
    name: "CIREX Detailed Package",
    summary: "Cote d'Ivoire detailed prototype with weights.",
    links: [
      { label: "JSON", href: "../wasi-upload/cirex_fund_characteristics.json" },
      { label: "ZIP", href: "../wasi-upload/cirex_wasi_upload_package.zip" }
    ]
  },
  {
    name: "BUREX Detailed Package",
    summary: "Prototype détaillé du Burkina Faso avec recouvrement de corridor.",
    links: [
      { label: "JSON", href: "../wasi-upload-burex/burex_fund_characteristics.json" },
      { label: "ZIP", href: "../wasi-upload-burex/burex_wasi_upload_package.zip" }
    ]
  },
  {
    name: "Paquet de la famille WAEX",
    summary: "West Africa umbrella family characteristics.",
    links: [
      { label: "JSON", href: "../wasi-upload-waex/waex_family_characteristics.json" },
      { label: "ZIP", href: "../wasi-upload-waex/waex_wasi_upload_package.zip" }
    ]
  }
];

subfamilies.forEach((sf) => {
  uploadPackages.push({
    name: `${sf.code} Region (${sf.countries.length})`,
    summary: `${sf.countries.length} country packages in ${sf.name}.`,
    links: sf.countries.slice(0, 2).map((c) => ({
      label: c.code,
      href: `../wasi-upload/${c.code.toLowerCase()}/${c.code.toLowerCase()}_fund_characteristics.json`
    }))
  });
});

document.getElementById("upload-center").innerHTML = uploadPackages.map((pkg) => `
  <article class="mini-card">
    <strong>${pkg.name}</strong>
    <div class="muted">${pkg.summary}</div>
    <div class="action-row compact">${pkg.links.map((link) => `<a class="secondary-btn small-btn" href="${link.href}">${link.label}</a>`).join("")}</div>
  </article>
`).join("");

// Scope notes
const scopeNotes = [
  { title: "54 sovereign states", body: "Cette bibliothèque suit l'interprétation de l'Afrique à 54 États souverains. L'Union africaine compte 55 États membres, dont la République arabe sahraouie démocratique." },
  { title: "Pre-launch status", body: "All country packages are proposed and pre-launch. Official country trade statistics, benchmark rules, and legal review should be completed before institutional launch." },
  { title: "Regulatory separation", body: "Country-specific legal and securities review is required. Do not assume one regulatory regime applies across all 54 sovereign states." },
  { title: "Microfinance separation", body: "Fund vehicles should remain separate from any microfinance balance sheet." }
];

document.getElementById("scope-notes").innerHTML = scopeNotes.map((item) => `
  <article class="card"><strong>${item.title}</strong><div class="muted">${item.body}</div></article>
`).join("");

function labelStatus(status) {
  if (status === "ready") return "Disponible";
  if (status === "building") return "Built in workspace";
  return "Future";
}

function formatWholePercent(value) {
  return `${Math.round(value)}%`;
}

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}

function formatModel(model) {
  if (model === "coastal_export_model") return "Côtier";
  if (model === "landlocked_corridor_model") return "Enclavé";
  return "Insulaire";
}

function formatRole(role) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
