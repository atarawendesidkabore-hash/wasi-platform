// WASI DEX — Africa Intelligence Platform
// All 54 AFEX sovereign-state instruments loaded from wasi-upload

const SUBFAMILY_COLORS = {
  NAEX: { color: "#f59e0b", label: "Afrique du Nord" },
  WAEX: { color: "#22c55e", label: "Afrique de l'Ouest" },
  CAEX: { color: "#a78bfa", label: "Afrique centrale" },
  EAEX: { color: "#3b82f6", label: "Afrique de l'Est" },
  SAEX: { color: "#ef4444", label: "Afrique australe" }
};

const MODEL_LABELS = {
  coastal_export_model: "Côtier",
  landlocked_corridor_model: "Enclavé",
  island_export_model: "Insulaire"
};

const EXPORTS_BASE_PATH = "./exports";
const AFEX_MANIFEST_JSON_PATH = `${EXPORTS_BASE_PATH}/afex_all54_manifest.json`;
const AFEX_MANIFEST_MD_PATH = `${EXPORTS_BASE_PATH}/afex_all54_manifest.md`;

function getFundJsonPath(code) {
  const slug = String(code || "").toLowerCase();
  return `${EXPORTS_BASE_PATH}/${slug}/${slug}_fund_characteristics.json`;
}

function getFundMarkdownPath(code) {
  const slug = String(code || "").toLowerCase();
  return `${EXPORTS_BASE_PATH}/${slug}/${slug}_fund_characteristics.md`;
}

const instruments = [
  // NAEX — North Africa
  { code: "ALGEX", country: "Algérie", iso3: "DZA", currency: "DZD", subfamily: "NAEX", model: "coastal_export_model", role: "energy_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Condensats", "Minerai de fer", "Phosphates"], note: "Référence d'exportation énergétique, exposition minière secondaire." },
  { code: "EGYEX", country: "Égypte", iso3: "EGY", currency: "EGP", subfamily: "NAEX", model: "coastal_export_model", role: "diversified_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Or", "Coton brut", "Phosphates"], note: "Logique d'exportation énergétique, minière et agricole." },
  { code: "LBYEX", country: "Libye", iso3: "LBY", currency: "LYD", subfamily: "NAEX", model: "coastal_export_model", role: "energy_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Condensats", "Charges pétrochimiques"], note: "Référence énergétique très concentrée." },
  { code: "MAREX", country: "Maroc", iso3: "MAR", currency: "MAD", subfamily: "NAEX", model: "coastal_export_model", role: "diversified_coastal_member", detail: "starter_profile", commodities: ["Phosphates", "Poissons et fruits de mer", "Agrumes", "Concentrés de plomb et de zinc"], note: "Phosphates et pêche, profil côtier diversifié." },
  { code: "TUNEX", country: "Tunisie", iso3: "TUN", currency: "TND", subfamily: "NAEX", model: "coastal_export_model", role: "coastal_diversified_member", detail: "starter_profile", commodities: ["Huile d'olive", "Phosphates", "Pétrole brut", "Dattes"], note: "Énergie, phosphates et exportations agroalimentaires." },
  { code: "SUDEX", country: "Soudan", iso3: "SDN", currency: "SDG", subfamily: "NAEX", model: "coastal_export_model", role: "agri_and_minerals_member", detail: "starter_profile", commodities: ["Or", "Gomme arabique", "Bétail", "Graines de sésame", "Coton brut"], note: "Exportations minières et agricoles ; prudence liée au risque de conflit." },

  // WAEX — West Africa
  { code: "BENEX", country: "Bénin", iso3: "BEN", currency: "XOF", subfamily: "WAEX", model: "coastal_export_model", role: "coastal_corridor_member", detail: "starter_profile", commodities: ["Coton brut", "Noix de cajou", "Soja", "Noix de karité"], note: "Exportateur côtier et interface de corridor pour le commerce sahélien." },
  { code: "BUREX", country: "Burkina Faso", iso3: "BFA", currency: "XOF", subfamily: "WAEX", model: "landlocked_corridor_model", role: "landlocked_corridor_member", detail: "detailed_prototype_ready", commodities: ["Autres graines oléagineuses", "Noix de cajou", "Coton brut", "Graines de sésame", "Minerai de zinc", "Or"], note: "Prototype détaillé. Commerce de corridor avec recouvrement sur six pays." },
  { code: "CABEX", country: "Cap-Vert", iso3: "CPV", currency: "CVE", subfamily: "WAEX", model: "island_export_model", role: "island_member", detail: "starter_profile", commodities: ["Poissons et fruits de mer", "Sel", "Produits de la mer"], note: "Base de matières premières réduite ; alerte de diversification." },
  { code: "CIREX", country: "Côte d'Ivoire", iso3: "CIV", currency: "XOF", subfamily: "WAEX", model: "coastal_export_model", role: "coastal_anchor_member", detail: "detailed_prototype_ready", commodities: ["Fèves de cacao", "Caoutchouc naturel", "Noix de cajou", "Pétrole brut", "Manganèse", "Huile de palme", "Coton brut", "Café", "Nickel", "Or", "Diamants"], note: "Prototype détaillé. Économie d'exportation portuaire ancrée sur le cacao." },
  { code: "GMBEX", country: "Gambie", iso3: "GMB", currency: "GMD", subfamily: "WAEX", model: "coastal_export_model", role: "river_coastal_member", detail: "starter_profile", commodities: ["Arachides", "Poissons et fruits de mer", "Graines de sésame", "Noix de cajou"], note: "Base d'exportation agricole et halieutique étroite." },
  { code: "GHAEX", country: "Ghana", iso3: "GHA", currency: "GHS", subfamily: "WAEX", model: "coastal_export_model", role: "coastal_anchor_member", detail: "detailed_prototype_ready", commodities: ["Fèves de cacao", "Or", "Pétrole brut", "Manganèse", "Bauxite", "Bois"], note: "Prototype détaillé. Profil double cacao-mines, corridor pertinent vers le Burkina Faso." },
  { code: "GUIEX", country: "Guinée", iso3: "GIN", currency: "GNF", subfamily: "WAEX", model: "coastal_export_model", role: "minerals_anchor_member", detail: "starter_profile", commodities: ["Bauxite", "Or", "Diamants", "Minerai de fer"], note: "Logique d'exportation à forte dominante minière." },
  { code: "GNBEX", country: "Guinée-Bissau", iso3: "GNB", currency: "XOF", subfamily: "WAEX", model: "coastal_export_model", role: "single_crop_member", detail: "starter_profile", commodities: ["Noix de cajou", "Poissons et fruits de mer", "Arachides"], note: "Alerte de concentration : forte dépendance à l'anacarde." },
  { code: "LIBEX", country: "Liberia", iso3: "LBR", currency: "LRD", subfamily: "WAEX", model: "coastal_export_model", role: "minerals_and_agriculture_member", detail: "starter_profile", commodities: ["Caoutchouc naturel", "Minerai de fer", "Or", "Huile de palme", "Bois"], note: "Exportations minières et de plantation." },
  { code: "MALIEX", country: "Mali", iso3: "MLI", currency: "XOF", subfamily: "WAEX", model: "landlocked_corridor_model", role: "landlocked_corridor_member", detail: "starter_profile", commodities: ["Or", "Coton brut", "Bétail", "Graines de sésame", "Noix de karité"], note: "Logique de corridor, mélange or et bétail." },
  { code: "MRTEX", country: "Mauritanie", iso3: "MRT", currency: "MRU", subfamily: "WAEX", model: "coastal_export_model", role: "minerals_and_fisheries_member", detail: "starter_profile", commodities: ["Minerai de fer", "Or", "Concentré de cuivre", "Poissons et fruits de mer"], note: "Exportations minières combinées à la pêche." },
  { code: "NEREX", country: "Niger", iso3: "NER", currency: "XOF", subfamily: "WAEX", model: "landlocked_corridor_model", role: "landlocked_corridor_member", detail: "starter_profile", commodities: ["Uranium", "Pétrole brut", "Bétail", "Niébé", "Oignons"], note: "Corridor enclavé : exportations minières et agricoles." },
  { code: "NGAEX", country: "Nigeria", iso3: "NGA", currency: "NGN", subfamily: "WAEX", model: "coastal_export_model", role: "energy_anchor_member", detail: "detailed_prototype_ready", commodities: ["Pétrole brut", "Gaz naturel", "Fèves de cacao", "Graines de sésame", "Caoutchouc naturel", "Urée"], note: "Prototype détaillé. Première économie d'Afrique. Référence à dominante énergétique (~86 % pétrole et gaz en tonnage)." },
  { code: "SENEX", country: "Sénégal", iso3: "SEN", currency: "XOF", subfamily: "WAEX", model: "coastal_export_model", role: "coastal_diversified_member", detail: "starter_profile", commodities: ["Phosphates", "Or", "Poissons et fruits de mer", "Arachides", "Zircon"], note: "Exposition minière et halieutique." },
  { code: "SLEX", country: "Sierra Leone", iso3: "SLE", currency: "SLE", subfamily: "WAEX", model: "coastal_export_model", role: "minerals_member", detail: "starter_profile", commodities: ["Diamants", "Minerai de fer", "Rutile", "Bauxite", "Cacao"], note: "Matières minières, exposition agricole plus faible." },
  { code: "TOGEX", country: "Togo", iso3: "TGO", currency: "XOF", subfamily: "WAEX", model: "coastal_export_model", role: "coastal_corridor_member", detail: "starter_profile", commodities: ["Phosphates", "Coton brut", "Soja", "Noix de cajou"], note: "Pays exportateur et interface de corridor pour le commerce sahélien." },

  // CAEX — Central Africa
  { code: "CAMEX", country: "Cameroun", iso3: "CMR", currency: "XAF", subfamily: "CAEX", model: "coastal_export_model", role: "diversified_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Fèves de cacao", "Bois", "Coton brut", "Café", "Gaz naturel"], note: "Exportations énergétiques, forestières et agricoles." },
  { code: "CAFEX", country: "République centrafricaine", iso3: "CAF", currency: "XAF", subfamily: "CAEX", model: "landlocked_corridor_model", role: "minerals_and_forest_member", detail: "starter_profile", commodities: ["Bois", "Or", "Diamants", "Coton brut"], note: "Corridor enclavé ; prudence liée au risque de gouvernance." },
  { code: "CHAEX", country: "Tchad", iso3: "TCD", currency: "XAF", subfamily: "CAEX", model: "landlocked_corridor_model", role: "energy_and_livestock_member", detail: "starter_profile", commodities: ["Pétrole brut", "Bétail", "Graines de sésame", "Gomme arabique", "Coton brut"], note: "Pétrole brut avec exportations agricoles et d'élevage." },
  { code: "COGEX", country: "République du Congo", iso3: "COG", currency: "XAF", subfamily: "CAEX", model: "coastal_export_model", role: "energy_member", detail: "starter_profile", commodities: ["Pétrole brut", "Bois", "Minerai de fer", "Potasse"], note: "Référence côtière tirée par le pétrole, forêt et mines en secondaire." },
  { code: "DRCEX", country: "République démocratique du Congo", iso3: "COD", currency: "CDF", subfamily: "CAEX", model: "landlocked_corridor_model", role: "minerals_anchor_member", detail: "starter_profile", commodities: ["Cuivre", "Cobalt", "Or", "Minerai d'étain", "Coltan", "Diamants"], note: "Forte dominante minière, modèle de transport multi-corridors." },
  { code: "EQGEX", country: "Guinée équatoriale", iso3: "GNQ", currency: "XAF", subfamily: "CAEX", model: "coastal_export_model", role: "energy_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Méthanol", "Bois", "Fèves de cacao"], note: "Référence d'exportation énergétique concentrée." },
  { code: "GABEX", country: "Gabon", iso3: "GAB", currency: "XAF", subfamily: "CAEX", model: "coastal_export_model", role: "energy_and_metals_member", detail: "starter_profile", commodities: ["Pétrole brut", "Manganèse", "Bois", "Or"], note: "Exposition pétrole, manganèse et bois." },
  { code: "STPEX", country: "Sao Tomé-et-Principe", iso3: "STP", currency: "STN", subfamily: "CAEX", model: "island_export_model", role: "island_member", detail: "starter_profile", commodities: ["Fèves de cacao", "Poissons et fruits de mer", "Produits du palmier"], note: "Alerte de petit marché et de concentration." },

  // EAEX — East Africa
  { code: "BDIEX", country: "Burundi", iso3: "BDI", currency: "BIF", subfamily: "EAEX", model: "landlocked_corridor_model", role: "agri_and_minerals_member", detail: "starter_profile", commodities: ["Café", "Thé", "Or", "Minerai de nickel"], note: "Agriculture et mines, corridor enclavé." },
  { code: "COMREX", country: "Comores", iso3: "COM", currency: "KMF", subfamily: "EAEX", model: "island_export_model", role: "island_member", detail: "starter_profile", commodities: ["Vanille", "Clous de girofle", "Ylang-ylang", "Poissons et fruits de mer"], note: "Référence agro-exportatrice insulaire étroite." },
  { code: "DJIEX", country: "Djibouti", iso3: "DJI", currency: "DJF", subfamily: "EAEX", model: "coastal_export_model", role: "trade_gateway_member", detail: "starter_profile", commodities: ["Sel", "Bétail", "Poissons et fruits de mer"], note: "Porte d'entrée commerciale stratégique, base de matières premières réduite." },
  { code: "ERIEX", country: "Érythrée", iso3: "ERI", currency: "ERN", subfamily: "EAEX", model: "coastal_export_model", role: "metals_member", detail: "starter_profile", commodities: ["Or", "Cuivre", "Zinc", "Potasse", "Sel"], note: "Référence minière de taille réduite." },
  { code: "ETHEX", country: "Éthiopie", iso3: "ETH", currency: "ETB", subfamily: "EAEX", model: "landlocked_corridor_model", role: "agri_anchor_member", detail: "starter_profile", commodities: ["Café", "Or", "Graines de sésame", "Graines oléagineuses", "Bétail"], note: "Corridor enclavé, agriculture diversifiée." },
  { code: "KENEX", country: "Kenya", iso3: "KEN", currency: "KES", subfamily: "EAEX", model: "coastal_export_model", role: "diversified_anchor_member", detail: "starter_profile", commodities: ["Thé", "Café", "Carbonate de sodium", "Minerai de titane", "Fleurs coupées"], note: "Exportations agricoles et minières, statut de hub logistique." },
  { code: "RWAEX", country: "Rwanda", iso3: "RWA", currency: "RWF", subfamily: "EAEX", model: "landlocked_corridor_model", role: "minerals_and_agri_member", detail: "starter_profile", commodities: ["Or", "Minerai d'étain", "Tantale", "Tungstène", "Café", "Thé"], note: "Corridor enclavé et exportateur de métaux spécialisés." },
  { code: "SOMEX", country: "Somalie", iso3: "SOM", currency: "SOS", subfamily: "EAEX", model: "coastal_export_model", role: "livestock_member", detail: "starter_profile", commodities: ["Bétail", "Graines de sésame", "Encens", "Poissons et fruits de mer"], note: "Prudence : fragilité élevée. Exportations de bétail et de sésame." },
  { code: "SSDEX", country: "Soudan du Sud", iso3: "SSD", currency: "SSP", subfamily: "EAEX", model: "landlocked_corridor_model", role: "energy_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gomme arabique", "Bétail", "Graines de sésame"], note: "Exportateur pétrolier enclavé, risque de fragilité élevé." },
  { code: "TZAEX", country: "Tanzanie", iso3: "TZA", currency: "TZS", subfamily: "EAEX", model: "coastal_export_model", role: "diversified_anchor_member", detail: "starter_profile", commodities: ["Or", "Noix de cajou", "Café", "Coton brut", "Tabac", "Gaz naturel"], note: "Exposition minière, agricole et gazière." },
  { code: "UGAEX", country: "Ouganda", iso3: "UGA", currency: "UGX", subfamily: "EAEX", model: "landlocked_corridor_model", role: "agri_anchor_member", detail: "starter_profile", commodities: ["Café", "Or", "Coton brut", "Thé", "Poissons et fruits de mer"], note: "Corridor enclavé, agriculture tirée par le café." },

  // SAEX — Southern Africa
  { code: "ANGEX", country: "Angola", iso3: "AGO", currency: "AOA", subfamily: "SAEX", model: "coastal_export_model", role: "energy_anchor_member", detail: "starter_profile", commodities: ["Pétrole brut", "Gaz naturel", "Diamants", "Minerai de fer", "Café"], note: "Référence tirée par le pétrole, diamants en secondaire." },
  { code: "BOTEX", country: "Botswana", iso3: "BWA", currency: "BWP", subfamily: "SAEX", model: "landlocked_corridor_model", role: "diamonds_member", detail: "starter_profile", commodities: ["Diamants", "Cuivre", "Nickel", "Carbonate de sodium", "Viande bovine"], note: "Diamants et mines, corridor enclavé." },
  { code: "ESWEX", country: "Eswatini", iso3: "SWZ", currency: "SZL", subfamily: "SAEX", model: "landlocked_corridor_model", role: "agri_industrial_member", detail: "starter_profile", commodities: ["Sucre", "Pâte à papier", "Agrumes", "Charbon"], note: "Exportations agro-industrielles et liées à la forêt." },
  { code: "LESEX", country: "Lesotho", iso3: "LSO", currency: "LSL", subfamily: "SAEX", model: "landlocked_corridor_model", role: "small_minerals_member", detail: "starter_profile", commodities: ["Laine", "Mohair", "Diamants"], note: "Prudence : petit marché. Laine, mohair et diamants." },
  { code: "MDGEX", country: "Madagascar", iso3: "MDG", currency: "MGA", subfamily: "SAEX", model: "island_export_model", role: "agri_and_minerals_member", detail: "starter_profile", commodities: ["Vanille", "Nickel et cobalt", "Clous de girofle", "Minerai de chrome", "Ilménite"], note: "Agriculture de spécialité, mines en secondaire." },
  { code: "MWIEX", country: "Malawi", iso3: "MWI", currency: "MWK", subfamily: "SAEX", model: "landlocked_corridor_model", role: "agri_member", detail: "starter_profile", commodities: ["Tabac", "Thé", "Sucre", "Noix de macadamia"], note: "Référence agricole, dépendance au corridor." },
  { code: "MUSEX", country: "Maurice", iso3: "MUS", currency: "MUR", subfamily: "SAEX", model: "island_export_model", role: "island_member", detail: "starter_profile", commodities: ["Sucre", "Poissons et fruits de mer", "Mélasse"], note: "Base de matières premières limitée ; alerte de diversification." },
  { code: "MOZEX", country: "Mozambique", iso3: "MOZ", currency: "MZN", subfamily: "SAEX", model: "coastal_export_model", role: "energy_and_mining_member", detail: "starter_profile", commodities: ["Charbon", "Gaz naturel", "Graphite", "Sables minéralisés lourds", "Aluminium"], note: "Énergie et mines, rôle de corridor régional." },
  { code: "NAMEX", country: "Namibie", iso3: "NAM", currency: "NAD", subfamily: "SAEX", model: "coastal_export_model", role: "minerals_member", detail: "starter_profile", commodities: ["Diamants", "Uranium", "Zinc", "Cuivre", "Poissons et fruits de mer"], note: "Exposition minière et halieutique." },
  { code: "SEYEX", country: "Seychelles", iso3: "SYC", currency: "SCR", subfamily: "SAEX", model: "island_export_model", role: "island_member", detail: "starter_profile", commodities: ["Poissons et fruits de mer", "Thon", "Cannelle", "Vanille"], note: "Référence insulaire tirée par la pêche." },
  { code: "ZAFEX", country: "Afrique du Sud", iso3: "ZAF", currency: "ZAR", subfamily: "SAEX", model: "coastal_export_model", role: "continental_anchor_member", detail: "starter_profile", commodities: ["Or", "Métaux du groupe platine", "Charbon", "Minerai de fer", "Manganèse", "Chrome"], note: "Ancre continentale : profondeur, échelle et diversité des matières." },
  { code: "ZMBEX", country: "Zambie", iso3: "ZMB", currency: "ZMW", subfamily: "SAEX", model: "landlocked_corridor_model", role: "copper_anchor_member", detail: "starter_profile", commodities: ["Cuivre", "Cobalt", "Émeraudes", "Sucre"], note: "Cuivre et cobalt, exportations dépendantes du corridor." },
  { code: "ZIMEX", country: "Zimbabwe", iso3: "ZWE", currency: "ZWG", subfamily: "SAEX", model: "landlocked_corridor_model", role: "minerals_anchor_member", detail: "starter_profile", commodities: ["Or", "Platine", "Lithium", "Tabac", "Nickel"], note: "Exportations minières et agricoles. Revue renforcée de la gouvernance monétaire." }
];

// FX — African currency rates vs XOF (indicative reference rates, source: BCEAO / market mid-rate)
// XOF is pegged to EUR at 655.957 XOF = 1 EUR (fixed since 1999)
// Rates expressed as: 1 unit of currency = X XOF
const FX_RATES_FALLBACK = [
  // ── Base & Anchor ──────────────────────────────────────────────────────────
  { currency: "XOF", name: "CFA Franc UEMOA", countries: ["Bénin", "Burkina Faso", "Côte d'Ivoire", "Guinée-Bissau", "Mali", "Niger", "Sénégal", "Togo"], region: "WAEX", rate: 1.0000, status: "base", note: "Base currency (BCEAO peg to EUR)" },
  { currency: "XAF", name: "CFA Franc BEAC", countries: ["Cameroun", "CAR", "Tchad", "Congo", "Guinée équatoriale", "Gabon"], region: "CAEX", rate: 1.0000, status: "pegged", note: "At parity with XOF (both pegged to EUR at 655.957)" },
  { currency: "EUR", name: "Euro (référence)", countries: ["Zone Euro"], region: "REF", rate: 655.957, status: "anchor", note: "Anchor currency — XOF/XAF peg fixed" },
  { currency: "USD", name: "US Dollar (référence)", countries: ["—"], region: "REF", rate: 615.00, status: "ref", note: "Indicative — marché mid-rate" },

  // ── North Africa (NAEX) ───────────────────────────────────────────────────
  { currency: "DZD", name: "Dinar Algérien", countries: ["Algérie"], region: "NAEX", rate: 4.60, status: "managed", note: "Géré par la Banque d'Algérie" },
  { currency: "EGP", name: "Livre Égyptienne", countries: ["Égypte"], region: "NAEX", rate: 12.80, status: "flottant", note: "Flottant dirigé depuis 2022" },
  { currency: "LYD", name: "Dinar Libyen", countries: ["Libye"], region: "NAEX", rate: 128.0, status: "managed", note: "Taux multiple — instabilité institutionnelle" },
  { currency: "MAD", name: "Dirham Marocain", countries: ["Maroc"], region: "NAEX", rate: 61.5, status: "semi-pegged", note: "Panier EUR/USD (60%/40%)" },
  { currency: "TND", name: "Dinar Tunisien", countries: ["Tunisie"], region: "NAEX", rate: 198.5, status: "managed", note: "Flottant géré par la BCT" },
  { currency: "SDG", name: "Livre Soudanaise", countries: ["Soudan"], region: "NAEX", rate: 1.08, status: "volatile", note: "Très volatile — contexte de crise" },

  // ── West Africa non-XOF (WAEX) ────────────────────────────────────────────
  { currency: "CVE", name: "Escudo Cap-Verdien", countries: ["Cap-Vert"], region: "WAEX", rate: 5.96, status: "pegged", note: "Ancré à l'EUR (1 EUR = 110.265 CVE)" },
  { currency: "GMD", name: "Dalasi Gambien", countries: ["Gambia"], region: "WAEX", rate: 8.54, status: "flottant", note: "Flottant dirigé" },
  { currency: "GHS", name: "Cedi Ghanéen", countries: ["Ghana"], region: "WAEX", rate: 39.7, status: "flottant", note: "Flottant — forte dépréciation 2022–2023" },
  { currency: "GNF", name: "Franc Guinéen", countries: ["Guinée"], region: "WAEX", rate: 0.0715, status: "managed", note: "Géré par la BCRG" },
  { currency: "LRD", name: "Dollar Libérien", countries: ["Liberia"], region: "WAEX", rate: 3.17, status: "flottant", note: "Cours libre" },
  { currency: "MRU", name: "Ouguiya Mauritanien", countries: ["Mauritanie"], region: "WAEX", rate: 15.57, status: "managed", note: "Géré par la BCM (réforme 2018 ÷10)" },
  { currency: "NGN", name: "Naira Nigérian", countries: ["Nigeria"], region: "WAEX", rate: 0.389, status: "volatile", note: "Flottant unifié depuis juin 2023" },
  { currency: "SLE", name: "Leone Sierra-Léonais", countries: ["Sierra Leone"], region: "WAEX", rate: 0.0273, status: "managed", note: "Réforme 2022 : 1 nouveau Leone = 1000 anciens" },

  // ── Central Africa non-XAF (CAEX) ────────────────────────────────────────
  { currency: "CDF", name: "Franc Congolais", countries: ["République démocratique du Congo"], region: "CAEX", rate: 0.220, status: "volatile", note: "Très déprécié — dollarisation partielle" },
  { currency: "STN", name: "Dobra São-Toméen", countries: ["Sao Tome & Principe"], region: "CAEX", rate: 25.1, status: "pegged", note: "Ancré à l'EUR (1 EUR = 24.5 STN env.)" },

  // ── East Africa (EAEX) ────────────────────────────────────────────────────
  { currency: "BIF", name: "Franc Burundais", countries: ["Burundi"], region: "EAEX", rate: 0.213, status: "managed", note: "Géré par la BRB" },
  { currency: "KMF", name: "Franc Comorien", countries: ["Comores"], region: "EAEX", rate: 1.333, status: "pegged", note: "Ancré à l'EUR via Trésor français (491.97 KMF = 1 EUR)" },
  { currency: "DJF", name: "Franc Djiboutien", countries: ["Djibouti"], region: "EAEX", rate: 3.46, status: "pegged", note: "Ancré au USD (1 USD = 177.721 DJF)" },
  { currency: "ERN", name: "Nakfa Érythréen", countries: ["Érythrée"], region: "EAEX", rate: 41.0, status: "fixed", note: "Taux officiel fixe 1 USD = 15 ERN" },
  { currency: "ETB", name: "Birr Éthiopien", countries: ["Éthiopie"], region: "EAEX", rate: 5.13, status: "managed", note: "Géré par la NBE" },
  { currency: "KES", name: "Shilling Kényan", countries: ["Kenya"], region: "EAEX", rate: 4.77, status: "flottant", note: "Flottant dirigé — hub régional" },
  { currency: "RWF", name: "Franc Rwandais", countries: ["Rwanda"], region: "EAEX", rate: 0.443, status: "managed", note: "Géré par la BNR" },
  { currency: "SOS", name: "Shilling Somalien", countries: ["Somalie"], region: "EAEX", rate: 1.077, status: "volatile", note: "Instabilité institutionnelle — usage USD dominant" },
  { currency: "SSP", name: "Livre Sud-Soudanaise", countries: ["Soudan du Sud"], region: "EAEX", rate: 0.473, status: "volatile", note: "Très volatile — contexte de conflit" },
  { currency: "TZS", name: "Shilling Tanzanien", countries: ["Tanzanie"], region: "EAEX", rate: 0.228, status: "managed", note: "Géré par la BoT" },
  { currency: "UGX", name: "Shilling Ougandais", countries: ["Ouganda"], region: "EAEX", rate: 0.164, status: "flottant", note: "Flottant dirigé — BoU" },

  // ── Southern Africa (SAEX) ────────────────────────────────────────────────
  { currency: "AOA", name: "Kwanza Angolais", countries: ["Angola"], region: "SAEX", rate: 0.683, status: "managed", note: "Géré par la BNA — lié au USD/EUR" },
  { currency: "BWP", name: "Pula Botswanais", countries: ["Botswana"], region: "SAEX", rate: 44.9, status: "semi-pegged", note: "Panier (ZAR + SDR)" },
  { currency: "SZL", name: "Lilangeni Swazi", countries: ["Eswatini"], region: "SAEX", rate: 33.8, status: "pegged", note: "Ancré au ZAR à parité (CMA)" },
  { currency: "LSL", name: "Loti Lésothan", countries: ["Lesotho"], region: "SAEX", rate: 33.8, status: "pegged", note: "Ancré au ZAR à parité (CMA)" },
  { currency: "MGA", name: "Ariary Malgache", countries: ["Madagascar"], region: "SAEX", rate: 0.137, status: "managed", note: "Géré par la BFM" },
  { currency: "MWK", name: "Kwacha Malawien", countries: ["Malawi"], region: "SAEX", rate: 0.353, status: "managed", note: "Géré par la RBM — forte dépréciation" },
  { currency: "MUR", name: "Roupie Mauricienne", countries: ["Maurice"], region: "SAEX", rate: 13.82, status: "managed", note: "Géré par la BoM" },
  { currency: "MZN", name: "Metical Mozambicain", countries: ["Mozambique"], region: "SAEX", rate: 9.61, status: "managed", note: "Géré par le BM" },
  { currency: "NAD", name: "Dollar Namibien", countries: ["Namibie"], region: "SAEX", rate: 33.8, status: "pegged", note: "Ancré au ZAR à parité (CMA)" },
  { currency: "SCR", name: "Roupie Seychelloise", countries: ["Seychelles"], region: "SAEX", rate: 45.2, status: "flottant", note: "Flottant depuis 2008" },
  { currency: "ZAR", name: "Rand Sud-Africain", countries: ["Afrique du Sud"], region: "SAEX", rate: 33.8, status: "flottant", note: "Flottant libre — ancre CMA" },
  { currency: "ZMW", name: "Kwacha Zambien", countries: ["Zambie"], region: "SAEX", rate: 22.4, status: "managed", note: "Géré par la BoZ" },
  { currency: "ZWG", name: "Zimbabwe Gold (ZiG)", countries: ["Zimbabwe"], region: "SAEX", rate: 23.7, status: "managed", note: "Nouvelle monnaie 2024 — adossée à l'or" }
];

const FX_REFERENCE_XOF_PER_EUR = 655.957;
const FX_REFRESH_TTL_MS = 12 * 60 * 60 * 1000;
const FX_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const FX_CACHE_KEY = "wasiDexFxCacheV1";
const FX_API_URL = "https://api.frankfurter.dev/v2/rates";
const FX_FIXED_EUR_PEGS = {
  XOF: FX_REFERENCE_XOF_PER_EUR,
  XAF: FX_REFERENCE_XOF_PER_EUR,
  CVE: 110.265,
  KMF: 491.96775
};

let fxRates = cloneFxRows(FX_RATES_FALLBACK);
let fxSync = {
  loading: false,
  source: "fallback",
  error: "",
  fetchedAt: null,
  marketDateLabel: "Mars 2025",
  updatedBy: "Référence intégrée"
};

function cloneFxRows(rows) {
  return rows.map((row) => ({ ...row, countries: [...row.countries] }));
}

function rerenderFxIfVisible() {
  if (currentView === "fx") renderContent();
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMarketDateLabel(value) {
  if (!value || typeof value !== "string") return "—";
  if (!value.includes("-")) return value;
  const parts = value.split(" à ");
  return parts
    .map((part) => {
      const date = new Date(`${part}T00:00:00`);
      return Number.isNaN(date.getTime())
        ? part
        : date.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" });
    })
    .join(" à ");
}

function getFxStatusClass() {
  if (fxSync.loading) return "sync";
  if (fxSync.source === "live") return "live";
  if (fxSync.source === "cache") return "cache";
  return "fallback";
}

function getFxStatusText() {
  if (fxSync.loading) return "Mise à jour des taux en cours...";
  if (fxSync.source === "live") {
    return `Auto en ligne · ${fxSync.updatedBy} · synchro ${formatDateTime(fxSync.fetchedAt)}`;
  }
  if (fxSync.source === "cache") {
    return `Cache local · dernière synchro ${formatDateTime(fxSync.fetchedAt)}`;
  }
  return "Mode secours intégré · valeurs de référence embarquées";
}

function loadCachedFxRates() {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    if (!payload || !Array.isArray(payload.rows) || !payload.meta) return false;
    fxRates = cloneFxRows(payload.rows);
    fxSync = {
      ...fxSync,
      ...payload.meta,
      source: payload.meta.source || "cache",
      error: ""
    };
    return true;
  } catch (_) {
    return false;
  }
}

function saveCachedFxRates() {
  try {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({
      rows: fxRates,
      meta: {
        source: fxSync.source,
        error: "",
        fetchedAt: fxSync.fetchedAt,
        marketDateLabel: fxSync.marketDateLabel,
        updatedBy: fxSync.updatedBy
      }
    }));
  } catch (_) {
    // Ignore localStorage failures in embedded/browser-restricted contexts.
  }
}

function shouldRefreshFxRates(force = false) {
  if (force) return true;
  if (!fxSync.fetchedAt) return true;
  return (Date.now() - fxSync.fetchedAt) > FX_REFRESH_TTL_MS;
}

function getDynamicFxCodes() {
  return fxRates
    .map((row) => row.currency)
    .filter((code) => !["XOF", "XAF", "EUR"].includes(code));
}

function buildMarketDateLabel(dates) {
  const uniqueDates = [...new Set(dates.filter(Boolean))].sort();
  if (!uniqueDates.length) return "—";
  if (uniqueDates.length === 1) return uniqueDates[0];
  return `${uniqueDates[0]} à ${uniqueDates[uniqueDates.length - 1]}`;
}

function convertEurQuoteToXofRate(currency, eurToCurrency) {
  if (currency === "XOF" || currency === "XAF") return 1;
  if (currency === "EUR") return FX_REFERENCE_XOF_PER_EUR;
  if (FX_FIXED_EUR_PEGS[currency]) {
    return FX_REFERENCE_XOF_PER_EUR / FX_FIXED_EUR_PEGS[currency];
  }
  if (!eurToCurrency || eurToCurrency <= 0) return null;
  return FX_REFERENCE_XOF_PER_EUR / eurToCurrency;
}

async function fetchLatestFxRates() {
  const response = await fetch(`${FX_API_URL}?base=EUR&quotes=${encodeURIComponent(getDynamicFxCodes().join(","))}`, {
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Taux indisponibles (HTTP ${response.status})`);
  const rows = await response.json();
  const quotes = {};
  const dates = [];
  rows.forEach((row) => {
    if (row && row.quote) {
      quotes[row.quote] = row.rate;
      dates.push(row.date);
    }
  });

  const updatedRows = cloneFxRows(FX_RATES_FALLBACK).map((row) => {
    const liveRate = convertEurQuoteToXofRate(row.currency, quotes[row.currency]);
    return liveRate ? { ...row, rate: liveRate } : row;
  });

  return {
    rows: updatedRows,
    marketDateLabel: buildMarketDateLabel(dates),
    fetchedAt: Date.now(),
    updatedBy: "Frankfurter + parité fixe XOF/XAF"
  };
}

async function refreshFxRates(options = {}) {
  const { force = false } = options;
  if (fxSync.loading) return;
  if (!shouldRefreshFxRates(force)) return;

  fxSync = { ...fxSync, loading: true, error: "" };
  rerenderFxIfVisible();

  try {
    const latest = await fetchLatestFxRates();
    fxRates = latest.rows;
    fxSync = {
      loading: false,
      source: "live",
      error: "",
      fetchedAt: latest.fetchedAt,
      marketDateLabel: latest.marketDateLabel,
      updatedBy: latest.updatedBy
    };
    saveCachedFxRates();
  } catch (error) {
    fxSync = {
      ...fxSync,
      loading: false,
      error: error && error.message ? error.message : "Impossible de mettre à jour les taux."
    };
    if (!fxSync.fetchedAt) {
      fxSync.source = "fallback";
      fxSync.updatedBy = "Référence intégrée";
      fxSync.marketDateLabel = "Mars 2025";
    }
  }

  rerenderFxIfVisible();
}

function initializeFxRates() {
  if (loadCachedFxRates()) {
    fxSync.source = "cache";
  }
  refreshFxRates();
  setInterval(() => { refreshFxRates(); }, FX_REFRESH_INTERVAL_MS);
}

// Derived stats
const allCommodities = new Set(instruments.flatMap((i) => i.commodities));
const allCurrencies = new Set(instruments.map((i) => i.currency));
// A function, not a const: loading data/afex-profiles.json promotes countries
// to Detailed after this file is evaluated, so the count must be recomputed.
function getDetailedCount() {
  return instruments.filter((i) => i.detail === "detailed_prototype_ready").length;
}

// State
let filterSubfamily = null;
let filterModel = null;
let filterProfile = null;
let searchTerm = "";
let currentView = "grid";
let sortBy = "code";

function getFiltered() {
  return instruments.filter((i) => {
    if (filterSubfamily && i.subfamily !== filterSubfamily) return false;
    if (filterModel && i.model !== filterModel) return false;
    if (filterProfile === "detailed" && i.detail !== "detailed_prototype_ready") return false;
    if (filterProfile === "starter" && i.detail !== "starter_profile") return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const hay = [i.code, i.country, i.currency, i.subfamily, i.role, ...i.commodities].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function getSorted(list) {
  const copy = [...list];
  if (sortBy === "country") copy.sort((a, b) => a.country.localeCompare(b.country));
  else if (sortBy === "subfamily") copy.sort((a, b) => a.subfamily.localeCompare(b.subfamily) || a.code.localeCompare(b.code));
  else if (sortBy === "model") copy.sort((a, b) => a.model.localeCompare(b.model) || a.code.localeCompare(b.code));
  else if (sortBy === "commodities") copy.sort((a, b) => b.commodities.length - a.commodities.length);
  else copy.sort((a, b) => a.code.localeCompare(b.code));
  return copy;
}

// Clock
function updateClock() {
  const el = document.getElementById("clock");
  if (el) el.textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
setInterval(updateClock, 1000);
updateClock();

// KPI strip
function renderKPIs() {
  const filtered = getFiltered();
  const fc = new Set(filtered.flatMap((i) => i.commodities)).size;
  const kpis = [
    { label: "Instruments", value: filtered.length, note: `sur ${instruments.length} au total` },
    { label: "Sous-familles", value: new Set(filtered.map((i) => i.subfamily)).size, note: "groupes régionaux" },
    { label: "Détaillés", value: filtered.filter((i) => i.detail === "detailed_prototype_ready").length, note: "prototype prêt" },
    { label: "Matières", value: fc, note: "matières premières distinctes" },
    { label: "Devises", value: new Set(filtered.map((i) => i.currency)).size, note: "devises de référence" },
    { label: "Côtiers", value: filtered.filter((i) => i.model === "coastal_export_model").length, note: "tirés par les ports" },
    { label: "Enclavés", value: filtered.filter((i) => i.model === "landlocked_corridor_model").length, note: "corridor" },
    { label: "Insulaires", value: filtered.filter((i) => i.model === "island_export_model").length, note: "maritime / aérien" }
  ];
  document.getElementById("kpi-strip").innerHTML = kpis.map((k) => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-note">${k.note}</div>
    </div>
  `).join("");
}

// Terminal
function renderTerminal() {
  const filtered = getFiltered();
  const parts = [];
  if (filterSubfamily) parts.push(filterSubfamily);
  if (filterModel) parts.push(MODEL_LABELS[filterModel]);
  if (filterProfile) parts.push(filterProfile);
  if (searchTerm) parts.push(`"${searchTerm}"`);
  document.getElementById("terminal-count").textContent = `${filtered.length} instruments loaded`;
  document.getElementById("terminal-filter").textContent = parts.length ? parts.join(" + ") : "Aucun filtre";
  document.getElementById("terminal-commodities").textContent = `${new Set(filtered.flatMap((i) => i.commodities)).size} commodities tracked`;
}

// Sidebar nav
function renderSidebar() {
  // Subfamilies
  const sfCounts = {};
  instruments.forEach((i) => { sfCounts[i.subfamily] = (sfCounts[i.subfamily] || 0) + 1; });
  document.getElementById("subfamily-nav").innerHTML = `
    <button class="nav-btn ${!filterSubfamily ? "active" : ""}" data-sf="">
      <span class="nav-dot" style="background: var(--muted)"></span> Toutes les régions
      <span class="nav-count">${instruments.length}</span>
    </button>
    ${Object.entries(SUBFAMILY_COLORS).map(([code, info]) => `
      <button class="nav-btn ${filterSubfamily === code ? "active" : ""}" data-sf="${code}">
        <span class="nav-dot" style="background: ${info.color}"></span> ${info.label}
        <span class="nav-count">${sfCounts[code] || 0}</span>
      </button>
    `).join("")}
  `;
  document.getElementById("subfamily-nav").querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterSubfamily = btn.dataset.sf || null;
      renderAll();
    });
  });

  // Models
  const modelCounts = {};
  instruments.forEach((i) => { modelCounts[i.model] = (modelCounts[i.model] || 0) + 1; });
  document.getElementById("model-nav").innerHTML = `
    <button class="nav-btn ${!filterModel ? "active" : ""}" data-model="">Tous les modèles<span class="nav-count">${instruments.length}</span></button>
    ${Object.entries(MODEL_LABELS).map(([key, label]) => `
      <button class="nav-btn ${filterModel === key ? "active" : ""}" data-model="${key}">${label}<span class="nav-count">${modelCounts[key] || 0}</span></button>
    `).join("")}
  `;
  document.getElementById("model-nav").querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterModel = btn.dataset.model || null;
      renderAll();
    });
  });

  // Profile
  document.getElementById("profile-nav").innerHTML = `
    <button class="nav-btn ${!filterProfile ? "active" : ""}" data-profile="">All<span class="nav-count">${instruments.length}</span></button>
    <button class="nav-btn ${filterProfile === "detailed" ? "active" : ""}" data-profile="detailed">Détaillé<span class="nav-count">${getDetailedCount()}</span></button>
    <button class="nav-btn ${filterProfile === "starter" ? "active" : ""}" data-profile="starter">Initial<span class="nav-count">${instruments.length - getDetailedCount()}</span></button>
  `;
  document.getElementById("profile-nav").querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterProfile = btn.dataset.profile || null;
      renderAll();
    });
  });
}

// Grid view
function renderGrid(list) {
  const grouped = {};
  const order = ["NAEX", "WAEX", "CAEX", "EAEX", "SAEX"];
  if (sortBy === "subfamily" || sortBy === "code") {
    order.forEach((sf) => { grouped[sf] = []; });
    list.forEach((i) => {
      if (!grouped[i.subfamily]) grouped[i.subfamily] = [];
      grouped[i.subfamily].push(i);
    });
  }

  let html = "";
  if (sortBy === "subfamily" || sortBy === "code") {
    for (const sf of order) {
      if (!grouped[sf] || grouped[sf].length === 0) continue;
      const info = SUBFAMILY_COLORS[sf];
      html += `<div class="region-divider">
        <span class="region-divider-dot" style="background: ${info.color}"></span>
        <span class="region-divider-label">${info.label}</span>
        <span class="region-divider-line"></span>
        <span class="region-divider-count">${grouped[sf].length}</span>
      </div>`;
      html += grouped[sf].map((i) => cardHTML(i)).join("");
    }
  } else {
    html = list.map((i) => cardHTML(i)).join("");
  }

  return `<div class="instrument-grid">${html}</div>`;
}

function cardHTML(i) {
  const sf = SUBFAMILY_COLORS[i.subfamily];
  return `
    <article class="instrument-card ${i.detail === "detailed_prototype_ready" ? "detailed" : ""}" data-code="${i.code}">
      <div class="card-topline">
        <span class="card-code">${i.code}</span>
        <span class="card-subfamily" style="background: ${sf.color}22; color: ${sf.color}">${i.subfamily}</span>
      </div>
      <div class="card-country">${i.country}</div>
      <div class="card-meta">
        <span>${i.currency}</span>
        <span>${MODEL_LABELS[i.model]}</span>
        <span>${i.detail === "detailed_prototype_ready" ? "Détaillé" : "Initial"}</span>
      </div>
      <div class="card-commodities">
        ${i.commodities.slice(0, 3).map((c) => `<span class="commodity-tag">${c}</span>`).join("")}
        ${i.commodities.length > 3 ? `<span class="commodity-tag overflow">+${i.commodities.length - 3}</span>` : ""}
      </div>
      <div class="card-actions">
        <a class="card-link" href="${getFundJsonPath(i.code)}" target="_blank">JSON</a>
        <a class="card-link" href="${getFundMarkdownPath(i.code)}" target="_blank">MD</a>
      </div>
    </article>
  `;
}

// Table view
function renderTable(list) {
  return `
    <table class="instrument-table">
      <thead>
        <tr>
          <th>Code</th>
          <th>Pays</th>
          <th>Region</th>
          <th>Currency</th>
          <th>Model</th>
          <th>Profile</th>
          <th>Commodities</th>
          <th>Links</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((i) => `
          <tr data-code="${i.code}">
            <td><span class="table-code">${i.code}</span></td>
            <td>${i.country}</td>
            <td><span style="color: ${SUBFAMILY_COLORS[i.subfamily].color}">${i.subfamily}</span></td>
            <td>${i.currency}</td>
            <td>${MODEL_LABELS[i.model]}</td>
            <td><span class="table-badge ${i.detail === "detailed_prototype_ready" ? "badge-detailed" : "badge-starter"}">${i.detail === "detailed_prototype_ready" ? "Détaillé" : "Initial"}</span></td>
            <td>${i.commodities.length}</td>
            <td>
              <a class="card-link" href="${getFundJsonPath(i.code)}" target="_blank">JSON</a>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// Compare view
function renderCompare() {
  const options = instruments.map((i) => `<option value="${i.code}">${i.code} — ${i.country}</option>`).join("");
  return `
    <div class="compare-slots">
      <div class="compare-slot" id="compare-a">
        <div class="compare-slot-label">Instrument A</div>
        <select class="compare-select" id="compare-select-a"><option value="">Select...</option>${options}</select>
        <div class="compare-detail" id="compare-detail-a"></div>
      </div>
      <div class="compare-slot" id="compare-b">
        <div class="compare-slot-label">Instrument B</div>
        <select class="compare-select" id="compare-select-b"><option value="">Select...</option>${options}</select>
        <div class="compare-detail" id="compare-detail-b"></div>
      </div>
    </div>
  `;
}

function renderCompareDetail(id, code) {
  const el = document.getElementById(id);
  const slot = el.closest(".compare-slot");
  if (!code) { el.innerHTML = ""; slot.classList.remove("filled"); return; }
  const i = instruments.find((x) => x.code === code);
  if (!i) return;
  slot.classList.add("filled");
  const sf = SUBFAMILY_COLORS[i.subfamily];
  el.innerHTML = `
    <div class="compare-row"><span>Pays</span><strong>${i.country}</strong></div>
    <div class="compare-row"><span>ISO3</span><strong>${i.iso3}</strong></div>
    <div class="compare-row"><span>Region</span><strong style="color: ${sf.color}">${sf.label} (${i.subfamily})</strong></div>
    <div class="compare-row"><span>Currency</span><strong>${i.currency}</strong></div>
    <div class="compare-row"><span>Model</span><strong>${MODEL_LABELS[i.model]}</strong></div>
    <div class="compare-row"><span>Role</span><strong>${formatRole(i.role)}</strong></div>
    <div class="compare-row"><span>Profil</span><strong>${i.detail === "detailed_prototype_ready" ? "Prototype détaillé" : "Profil initial"}</strong></div>
    <div class="compare-row"><span>Commodity count</span><strong>${i.commodities.length}</strong></div>
    <div class="compare-commodities">
      ${i.commodities.map((c) => `<span class="commodity-tag">${c}</span>`).join("")}
    </div>
    <div style="margin-top: 8px; font-size: 0.82rem; color: var(--muted);">${i.note}</div>
    <div style="margin-top: 8px; display: flex; gap: 8px;">
      <a class="card-link" href="${getFundJsonPath(i.code)}" target="_blank">JSON</a>
      <a class="card-link" href="${getFundMarkdownPath(i.code)}" target="_blank">MD</a>
    </div>
  `;
}

// Detail drawer
function openDrawer(code) {
  const i = instruments.find((x) => x.code === code);
  if (!i) return;
  const drawer = document.getElementById("detail-drawer");
  const sf = SUBFAMILY_COLORS[i.subfamily];
  document.getElementById("drawer-title").textContent = `${i.code} — ${i.country}`;
  document.getElementById("drawer-body").innerHTML = `
    <div class="drawer-section">
      <div class="drawer-section-title">Identity</div>
      <div class="drawer-field"><span>Nom du fonds</span><strong>${i.code} Fund</strong></div>
      <div class="drawer-field"><span>Dénomination complète</span><strong>Fonds indiciel d'exportation brute — ${i.country}</strong></div>
      <div class="drawer-field"><span>Référence</span><strong>${i.country} Raw Export Index</strong></div>
      <div class="drawer-field"><span>ISO3</span><strong>${i.iso3}</strong></div>
    </div>
    <div class="drawer-section">
      <div class="drawer-section-title">Classification</div>
      <div class="drawer-field"><span>Famille</span><strong>AFEX</strong></div>
      <div class="drawer-field"><span>Subfamily</span><strong style="color: ${sf.color}">${i.subfamily} — ${sf.label}</strong></div>
      <div class="drawer-field"><span>Role</span><strong>${formatRole(i.role)}</strong></div>
      <div class="drawer-field"><span>Profil</span><strong>${i.detail === "detailed_prototype_ready" ? "Prototype détaillé" : "Profil initial"}</strong></div>
    </div>
    <div class="drawer-section">
      <div class="drawer-section-title">Methodology</div>
      <div class="drawer-field"><span>Model</span><strong>${MODEL_LABELS[i.model]}</strong></div>
      <div class="drawer-field"><span>Weighting</span><strong>${i.profile
        ? "Trailing " + i.profile.years_count + " ans — valeur moyenne d'exportation (USD)"
        : "Trailing 20-year avg export tonnage (target)"}</strong></div>
      <div class="drawer-field"><span>Reconstitution</span><strong>Annual</strong></div>
      <div class="drawer-field"><span>Rebalancing</span><strong>Quarterly</strong></div>
    </div>
    ${renderProfileSections(i)}
    <div class="drawer-section">
      <div class="drawer-section-title">Currency</div>
      <div class="drawer-field"><span>Base currency</span><strong>${i.currency}</strong></div>
      <div class="drawer-field"><span>Comparaison continentale</span><strong>USD</strong></div>
    </div>
    <div class="drawer-section">
      <div class="drawer-section-title">Candidate Commodities (${i.commodities.length})</div>
      <div class="drawer-commodities">
        ${i.commodities.map((c) => `<span class="drawer-commodity">${c}</span>`).join("")}
      </div>
    </div>
    <div class="drawer-section">
      <div class="drawer-section-title">Note</div>
      <div style="font-size: 0.88rem; color: var(--muted); line-height: 1.5;">${i.note}</div>
    </div>
    <div class="drawer-section">
      <div class="drawer-section-title">Package Links</div>
      <div class="drawer-links">
        <a class="drawer-link" href="${getFundJsonPath(i.code)}" target="_blank">Fonds (JSON)</a>
        <a class="drawer-link" href="${getFundMarkdownPath(i.code)}" target="_blank">Fonds (Markdown)</a>
        <a class="drawer-link" href="${AFEX_MANIFEST_JSON_PATH}" target="_blank">Manifeste AFEX</a>
      </div>
    </div>
  `;
  drawer.classList.remove("hidden");
}

/* Index weights + concentration, the substance behind a Detailed profile.
   Renders nothing when no profile has been built for the country yet. */
function renderProfileSections(i) {
  const p = i.profile;
  if (!p) return "";

  const conc = p.concentration || {};
  const concLabel = { tres_concentre: "Très concentré", concentre: "Concentré", diversifie: "Diversifié" }[conc.classification] || "—";
  const concColor = conc.classification === "tres_concentre" ? "#ff6b6b"
    : conc.classification === "concentre" ? "#f0a94c" : "#30d6a7";

  const usd = (v) => {
    if (!v) return "—";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return "$" + Math.round(v / 1e6) + "M";
    return "$" + Math.round(v / 1e3) + "K";
  };

  const rows = (p.constituents || []).map((c) => `
    <div class="afex-w-row">
      <span class="afex-w-name">${c.name}</span>
      <span class="afex-w-bar"><span class="afex-w-fill" style="width:${Math.min(100, c.weight)}%"></span></span>
      <span class="afex-w-val">${c.weight.toFixed(2)}%</span>
    </div>`).join("");

  return `
    <div class="drawer-section">
      <div class="drawer-section-title">Index Weights (${p.constituents.length}) — ${p.years_covered[0]}–${p.latest_year}</div>
      <div class="afex-weights">${rows}</div>
      <div style="font-size:.76rem;color:var(--muted);margin-top:8px;line-height:1.5;">
        Weights are the trailing average share of annual export value, renormalised across the retained constituents.
        Basis: <strong>valeur d'exportation (USD)</strong> — Comtrade net weight is unreported for this reporter
        (${p.tonnage_coverage_pct}% coverage), so tonnage weighting is not computable.
      </div>
    </div>
    <div class="drawer-section">
      <div class="drawer-section-title">Concentration</div>
      <div class="drawer-field"><span>Largest chapter</span><strong>${conc.top1_pct}% of exports</strong></div>
      <div class="drawer-field"><span>Top 5 chapters</span><strong>${conc.top5_pct}%</strong></div>
      <div class="drawer-field"><span>HHI</span><strong style="color:${concColor}">${conc.hhi} — ${concLabel}</strong></div>
      <div class="drawer-field"><span>Latest annual exports</span><strong>${usd(p.latest_total_export_usd)} (${p.latest_year})</strong></div>
      <div class="drawer-field"><span>Years of data</span><strong>${p.years_count}</strong></div>
      <div class="drawer-field"><span>Source</span><strong>${p.source}</strong></div>
    </div>`;
}

function closeDrawer() {
  document.getElementById("detail-drawer").classList.add("hidden");
}

// FX view
const FX_STATUS_COLORS = {
  base: { color: "#22c55e", label: "Base" },
  anchor: { color: "#f59e0b", label: "Ancre EUR" },
  pegged: { color: "#3b82f6", label: "Ancré" },
  "semi-pegged": { color: "#60a5fa", label: "Semi-ancré" },
  fixed: { color: "#a78bfa", label: "Fixe" },
  managed: { color: "#94a3b8", label: "Géré" },
  flottant: { color: "#e2e8f0", label: "Flottant" },
  volatile: { color: "#ef4444", label: "Volatile" },
  ref: { color: "#f59e0b", label: "Référence" }
};

function renderFXLegacy() {
  const regionOrder = ["REF", "WAEX", "CAEX", "NAEX", "EAEX", "SAEX"];
  const regionLabels = { REF: "Références Mondiales", WAEX: "Afrique de l'Ouest", CAEX: "Afrique Centrale", NAEX: "Afrique du Nord", EAEX: "Afrique de l'Est", SAEX: "Afrique Australe" };
  const regionColors = { REF: "#f59e0b", WAEX: "#22c55e", CAEX: "#a78bfa", NAEX: "#f59e0b", EAEX: "#3b82f6", SAEX: "#ef4444" };

  const grouped = {};
  regionOrder.forEach((r) => { grouped[r] = []; });
  FX_RATES.forEach((fx) => { if (grouped[fx.region]) grouped[fx.region].push(fx); });

  let html = `
    <div class="fx-wrapper">
      <div class="fx-header">
        <div class="fx-title-block">
          <div class="fx-title">Volet Change — XOF</div>
          <div class="fx-subtitle">Taux indicatifs de référence · 1 unité de devise = X XOF · Source: BCEAO / marché mid-rate</div>
        </div>
        <div class="fx-converter-block">
          <div class="fx-converter-label">Convertisseur rapide</div>
          <div class="fx-converter-row">
            <input type="number" class="fx-input" id="fx-amount" value="1" min="0" step="any">
            <select class="fx-select" id="fx-from">
              ${FX_RATES.filter(f => f.currency !== "XOF").map(f => `<option value="${f.currency}">${f.currency} — ${f.name}</option>`).join("")}
            </select>
            <span class="fx-arrow">→</span>
            <span class="fx-result" id="fx-result">—</span>
            <span class="fx-result-label">XOF</span>
          </div>
          <div class="fx-converter-note" id="fx-converter-note"></div>
        </div>
      </div>
      <div class="fx-disclaimer">
        ⚠ Taux indicatifs à titre de référence. Ne pas utiliser pour des transactions financières.
        Dernière mise à jour de référence : Mars 2025.
      </div>
  `;

  for (const region of regionOrder) {
    const rows = grouped[region];
    if (!rows.length) continue;
    const rColor = regionColors[region];
    html += `
      <div class="fx-region-block">
        <div class="fx-region-header" style="border-left: 3px solid ${rColor}; padding-left: 10px;">
          <span style="color: ${rColor}; font-weight: 600;">${regionLabels[region]}</span>
          <span class="fx-region-count">${rows.length} devise${rows.length > 1 ? "s" : ""}</span>
        </div>
        <table class="fx-table">
          <thead>
            <tr>
              <th>Devise</th>
              <th>Nom</th>
              <th>Pays</th>
              <th class="fx-num">1 unité → XOF</th>
              <th class="fx-num">1 XOF → devise</th>
              <th>Régime</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((fx) => {
      const sc = FX_STATUS_COLORS[fx.status] || { color: "#94a3b8", label: fx.status };
      const inv = fx.rate > 0 ? (1 / fx.rate) : 0;
      const invStr = inv >= 1000 ? inv.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) :
        inv >= 1 ? inv.toFixed(4) : inv.toFixed(6);
      const rateStr = fx.rate >= 1000 ? fx.rate.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) :
        fx.rate >= 1 ? fx.rate.toFixed(4) : fx.rate.toFixed(6);
      return `
                <tr class="fx-row${fx.currency === "XOF" ? " fx-base-row" : ""}">
                  <td><span class="fx-code">${fx.currency}</span></td>
                  <td class="fx-name">${fx.name}</td>
                  <td class="fx-countries">${fx.countries.join(", ")}</td>
                  <td class="fx-num fx-rate">${rateStr}</td>
                  <td class="fx-num fx-inv">${invStr}</td>
                  <td><span class="fx-badge" style="background: ${sc.color}22; color: ${sc.color}">${sc.label}</span></td>
                  <td class="fx-note-cell">${fx.note}</td>
                </tr>
              `;
    }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

function bindFXConverterLegacy() {
  const amountEl = document.getElementById("fx-amount");
  const fromEl = document.getElementById("fx-from");
  const resultEl = document.getElementById("fx-result");
  const noteEl = document.getElementById("fx-converter-note");

  function update() {
    const amount = parseFloat(amountEl.value) || 0;
    const code = fromEl.value;
    const fx = FX_RATES.find((f) => f.currency === code);
    if (!fx) return;
    const result = amount * fx.rate;
    resultEl.textContent = result.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    noteEl.textContent = `1 ${code} = ${fx.rate >= 1 ? fx.rate.toFixed(4) : fx.rate.toFixed(6)} XOF`;
  }

  amountEl.addEventListener("input", update);
  fromEl.addEventListener("change", update);
  update();
}

function renderFX() {
  const regionOrder = ["REF", "WAEX", "CAEX", "NAEX", "EAEX", "SAEX"];
  const regionLabels = { REF: "References Mondiales", WAEX: "Afrique de l'Ouest", CAEX: "Afrique Centrale", NAEX: "Afrique du Nord", EAEX: "Afrique de l'Est", SAEX: "Afrique Australe" };
  const regionColors = { REF: "#f59e0b", WAEX: "#22c55e", CAEX: "#a78bfa", NAEX: "#f59e0b", EAEX: "#3b82f6", SAEX: "#ef4444" };

  const grouped = {};
  regionOrder.forEach((r) => { grouped[r] = []; });
  fxRates.forEach((fx) => { if (grouped[fx.region]) grouped[fx.region].push(fx); });

  let html = `
    <div class="fx-wrapper">
      <div class="fx-header">
        <div class="fx-title-block">
          <div class="fx-title">Volet Change - XOF</div>
          <div class="fx-subtitle">Taux indicatifs - 1 unite de devise = X XOF - Source auto: Frankfurter / secours integre</div>
          <div class="fx-sync-line">
            <span class="fx-sync-status ${getFxStatusClass()}">${getFxStatusText()}</span>
            <button class="fx-refresh-btn" id="fx-refresh-btn" ${fxSync.loading ? "disabled" : ""}>${fxSync.loading ? "Mise a jour..." : "Actualiser"}</button>
          </div>
        </div>
        <div class="fx-converter-block">
          <div class="fx-converter-label">Convertisseur rapide</div>
          <div class="fx-converter-row">
            <input type="number" class="fx-input" id="fx-amount" value="1" min="0" step="any">
            <select class="fx-select" id="fx-from">
              ${fxRates.filter((f) => f.currency !== "XOF").map((f) => `<option value="${f.currency}">${f.currency} - ${f.name}</option>`).join("")}
            </select>
            <span class="fx-arrow">-></span>
            <span class="fx-result" id="fx-result">-</span>
            <span class="fx-result-label">XOF</span>
          </div>
          <div class="fx-converter-note" id="fx-converter-note"></div>
        </div>
      </div>
      <div class="fx-disclaimer">
        Taux indicatifs a titre de reference. Ne pas utiliser pour des transactions financieres.
        Reference marche : ${formatMarketDateLabel(fxSync.marketDateLabel)}.
        ${fxSync.error ? `Dernier incident : ${fxSync.error}.` : ""}
      </div>
  `;

  for (const region of regionOrder) {
    const rows = grouped[region];
    if (!rows.length) continue;
    const rColor = regionColors[region];
    html += `
      <div class="fx-region-block">
        <div class="fx-region-header" style="border-left: 3px solid ${rColor}; padding-left: 10px;">
          <span style="color: ${rColor}; font-weight: 600;">${regionLabels[region]}</span>
          <span class="fx-region-count">${rows.length} devise${rows.length > 1 ? "s" : ""}</span>
        </div>
        <table class="fx-table">
          <thead>
            <tr>
              <th>Devise</th>
              <th>Nom</th>
              <th>Pays</th>
              <th class="fx-num">1 unite -> XOF</th>
              <th class="fx-num">1 XOF -> devise</th>
              <th>Regime</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((fx) => {
      const sc = FX_STATUS_COLORS[fx.status] || { color: "#94a3b8", label: fx.status };
      const inv = fx.rate > 0 ? (1 / fx.rate) : 0;
      const invStr = inv >= 1000 ? inv.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) :
        inv >= 1 ? inv.toFixed(4) : inv.toFixed(6);
      const rateStr = fx.rate >= 1000 ? fx.rate.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) :
        fx.rate >= 1 ? fx.rate.toFixed(4) : fx.rate.toFixed(6);
      return `
                <tr class="fx-row${fx.currency === "XOF" ? " fx-base-row" : ""}">
                  <td><span class="fx-code">${fx.currency}</span></td>
                  <td class="fx-name">${fx.name}</td>
                  <td class="fx-countries">${fx.countries.join(", ")}</td>
                  <td class="fx-num fx-rate">${rateStr}</td>
                  <td class="fx-num fx-inv">${invStr}</td>
                  <td><span class="fx-badge" style="background: ${sc.color}22; color: ${sc.color}">${sc.label}</span></td>
                  <td class="fx-note-cell">${fx.note}</td>
                </tr>
              `;
    }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

function bindFXConverter() {
  const amountEl = document.getElementById("fx-amount");
  const fromEl = document.getElementById("fx-from");
  const resultEl = document.getElementById("fx-result");
  const noteEl = document.getElementById("fx-converter-note");
  const refreshBtn = document.getElementById("fx-refresh-btn");

  function update() {
    const amount = parseFloat(amountEl.value) || 0;
    const code = fromEl.value;
    const fx = fxRates.find((f) => f.currency === code);
    if (!fx) return;
    const result = amount * fx.rate;
    resultEl.textContent = result.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    noteEl.textContent = `1 ${code} = ${fx.rate >= 1 ? fx.rate.toFixed(4) : fx.rate.toFixed(6)} XOF`;
  }

  amountEl.addEventListener("input", update);
  fromEl.addEventListener("change", update);
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => refreshFxRates({ force: true }));
  }
  update();
}

// Content rendering
function renderContent() {
  const filtered = getSorted(getFiltered());
  const area = document.getElementById("content-area");

  if (currentView === "grid") {
    area.innerHTML = renderGrid(filtered);
  } else if (currentView === "table") {
    area.innerHTML = renderTable(filtered);
  } else if (currentView === "compare") {
    area.innerHTML = renderCompare();
    document.getElementById("compare-select-a").addEventListener("change", (e) => renderCompareDetail("compare-detail-a", e.target.value));
    document.getElementById("compare-select-b").addEventListener("change", (e) => renderCompareDetail("compare-detail-b", e.target.value));
  } else if (currentView === "fx") {
    area.innerHTML = renderFX();
    bindFXConverter();
  } else if (currentView === "transfer") {
    area.innerHTML = renderTransfer();
    bindTransfer();
  }

  // Card/row click handlers
  area.querySelectorAll("[data-code]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      openDrawer(el.dataset.code);
    });
  });
}

function renderAll() {
  renderKPIs();
  renderTerminal();
  renderSidebar();
  renderContent();
}

// View tabs
document.querySelectorAll(".view-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".view-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentView = tab.dataset.view;
    renderContent();
    if (currentView === "fx") refreshFxRates();
  });
});

// Sort
document.getElementById("sort-select").addEventListener("change", (e) => {
  sortBy = e.target.value;
  renderContent();
});

// Search
document.getElementById("search-input").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderAll();
});

// Drawer close
document.getElementById("drawer-close").addEventListener("click", closeDrawer);

// Utility
function formatRole(role) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── AFEX profiles — derived index weights from official trade statistics ────
// data/afex-profiles.json is produced by scripts/build-afex-profiles.mjs from
// UN Comtrade export values. A country is promoted from Starter to Detailed
// only when the data supports it (see promotion_rule in the file), so the
// badge in the table reflects real evidence rather than an editorial note.
let AFEX_PROFILES = {};
let AFEX_PROFILES_META = null;

async function loadAfexProfiles() {
  try {
    const res = await fetch("../data/afex-profiles.json?v=" + Date.now());
    if (!res.ok) return;
    const json = await res.json();
    if (!json || !json.countries) return;

    AFEX_PROFILES = json.countries;
    AFEX_PROFILES_META = json;

    instruments.forEach((entry) => {
      const p = AFEX_PROFILES[entry.code];
      if (!p) return;
      entry.profile = p;
      // Data-driven promotion; never demote a hand-built prototype.
      if (p.detail_level === "detailed_prototype_ready") {
        entry.detail = "detailed_prototype_ready";
      }
    });

    renderAll();
  } catch (err) {
    // Offline or absent file is fine — the hand-maintained profiles stand.
    // Anything else is a real bug and must not disappear silently.
    console.warn("AFEX profiles not applied:", err);
  }
}

// Initial render
renderAll();
loadAfexProfiles();
initializeFxRates();

// ── TRANSFER — Quote Simulator ──────────────────────────────────────────────

const TRANSFER_PRICING_TIERS = [
  { minAmount: 0, feePct: 0.012, fxMarginPct: 0.004, label: "Essentiel" },
  { minAmount: 200, feePct: 0.010, fxMarginPct: 0.004, label: "Growth" },
  { minAmount: 1000, feePct: 0.008, fxMarginPct: 0.004, label: "Pro" }
];

function pctLabel(value) {
  return `${(value * 100).toFixed(2).replace(".", ",")}%`;
}

function getTransferPricing(sendAmount) {
  const amount = Number.isFinite(sendAmount) ? sendAmount : 0;
  let selected = TRANSFER_PRICING_TIERS[0];
  for (const tier of TRANSFER_PRICING_TIERS) {
    if (amount >= tier.minAmount) selected = tier;
  }
  return {
    ...selected,
    totalCostPct: selected.feePct + selected.fxMarginPct
  };
}

// Supplemental send currencies not in the African fxRates table
const TRANSFER_SEND_EXTRAS = [
  { currency: "GBP", name: "British Pound", region: "REF", rate: 782.0, status: "ref", countries: ["United Kingdom"], note: "Indicatif" },
  { currency: "CAD", name: "Canadian Dollar", region: "REF", rate: 455.0, status: "ref", countries: ["Canada"], note: "Indicatif" }
];

function getTransferSendCurrencies() {
  const base = ["EUR", "USD"].map((code) => fxRates.find((f) => f.currency === code)).filter(Boolean);
  return [...base, ...TRANSFER_SEND_EXTRAS];
}

function getTransferSendXofRate(currency) {
  const live = fxRates.find((f) => f.currency === currency);
  if (live) return live.rate;
  const extra = TRANSFER_SEND_EXTRAS.find((f) => f.currency === currency);
  return extra ? extra.rate : null;
}

function getTransferReceiveCurrencies() {
  const sendCodes = new Set(["EUR", "USD", "GBP", "CAD"]);
  return fxRates.filter((f) => !sendCodes.has(f.currency) && f.region !== "REF");
}

function computeTransferQuote(sendAmount, sendCurrency, receiveCurrency) {
  const sendRate = getTransferSendXofRate(sendCurrency);
  const receiveEntry = fxRates.find((f) => f.currency === receiveCurrency);
  if (!sendRate || !receiveEntry) return null;

  const pricing = getTransferPricing(sendAmount);

  const receiveRate = receiveEntry.rate; // XOF per 1 receiveCurrency
  const feeAmount = sendAmount * pricing.feePct;
  const netSend = sendAmount - feeAmount;
  const xofDelivered = netSend * sendRate * (1 - pricing.fxMarginPct);
  const receiveAmount = receiveCurrency === "XOF" ? xofDelivered : xofDelivered / receiveRate;

  // Direct rate: how many receiveCurrency per 1 sendCurrency
  const midRateDirect = receiveCurrency === "XOF" ? sendRate : sendRate / receiveRate;
  const appliedRateDirect = midRateDirect * (1 - pricing.fxMarginPct);

  const effectiveCostPct = pricing.totalCostPct * 100;

  // Competitor estimates — based on gross XOF value before any fee
  const grossXof = sendAmount * sendRate;
  const grossReceive = receiveCurrency === "XOF" ? grossXof : grossXof / receiveRate;
  const wuReceive = grossReceive * (1 - 0.08);
  const mgReceive = grossReceive * (1 - 0.06);
  const waveReceive = grossReceive * (1 - 0.02);

  return {
    sendAmount, sendCurrency, receiveCurrency,
    pricing,
    feeAmount, receiveAmount,
    midRateDirect, appliedRateDirect, effectiveCostPct,
    comparison: {
      westernUnion: { amount: wuReceive, costPct: 8 },
      moneyGram: { amount: mgReceive, costPct: 6 },
      wave: { amount: waveReceive, costPct: 2 }
    }
  };
}

function fmtTransfer(value, currency) {
  if (currency === "XOF" || currency === "XAF") {
    return Math.round(value).toLocaleString("fr-FR");
  }
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderTransfer() {
  const sendCurrencies = getTransferSendCurrencies();
  const receiveCurrencies = getTransferReceiveCurrencies();
  const starterTier = getTransferPricing(50);
  const growthTier = getTransferPricing(200);
  const proTier = getTransferPricing(1000);
  const minTotalPct = Math.min(...TRANSFER_PRICING_TIERS.map((tier) => tier.feePct + tier.fxMarginPct));
  const maxTotalPct = Math.max(...TRANSFER_PRICING_TIERS.map((tier) => tier.feePct + tier.fxMarginPct));

  const sendOptions = sendCurrencies
    .map((f) => `<option value="${f.currency}">${f.currency} — ${f.name}</option>`).join("");
  const receiveOptions = receiveCurrencies
    .map((f) => `<option value="${f.currency}"${f.currency === "XOF" ? " selected" : ""}>${f.currency} — ${f.name} · ${(Array.isArray(f.countries) ? f.countries : []).join(", ")}</option>`).join("");

  return `
    <div class="tr-wrapper">
      <div class="tr-header">
        <div class="tr-title">WASI Transfer <span class="tr-beta">BETA</span></div>
        <div class="tr-subtitle">Simulateur de virement diaspora → Afrique · Taux AFEX de référence</div>
      </div>

      <div class="tr-layout">
        <div class="tr-form-panel">
          <div class="tr-field">
            <label class="tr-label">Vous envoyez</label>
            <div class="tr-input-row">
              <input type="number" class="tr-input" id="tr-amount" value="200" min="1" max="50000" step="1">
              <select class="tr-select" id="tr-send-currency">${sendOptions}</select>
            </div>
          </div>
          <div class="tr-arrow">↓</div>
          <div class="tr-field">
            <label class="tr-label">Destination (devise reçue)</label>
            <select class="tr-select tr-select-full" id="tr-receive-currency">${receiveOptions}</select>
          </div>
          <div class="tr-rate-note">
            Barème WASI: <strong>0–199</strong> = ${pctLabel(starterTier.totalCostPct)} · <strong>200–999</strong> = ${pctLabel(growthTier.totalCostPct)} · <strong>1000+</strong> = ${pctLabel(proTier.totalCostPct)}
          </div>
        </div>

        <div class="tr-quote-panel" id="tr-quote">
          <div class="tr-quote-placeholder">Entrez un montant pour voir le devis.</div>
        </div>
      </div>

      <div class="tr-market-section">
        <div class="tr-section-title">Contexte marché — Corridors diaspora → Afrique</div>
        <div class="tr-market-grid">
          <div class="tr-market-card high">
            <div class="tr-market-name">Western Union</div>
            <div class="tr-market-cost">~6–8%</div>
            <div class="tr-market-note">Frais fixes + marge FX élevée</div>
          </div>
          <div class="tr-market-card mid">
            <div class="tr-market-name">MoneyGram</div>
            <div class="tr-market-cost">~5–7%</div>
            <div class="tr-market-note">Réseau physique Afrique</div>
          </div>
          <div class="tr-market-card low">
            <div class="tr-market-name">Sendwave / Wave</div>
            <div class="tr-market-cost">~1,5–2%</div>
            <div class="tr-market-note">Mobile-first, zone XOF</div>
          </div>
          <div class="tr-market-card best">
            <div class="tr-market-name">WASI Transfer</div>
            <div class="tr-market-cost">~${pctLabel(minTotalPct)}–${pctLabel(maxTotalPct)}</div>
            <div class="tr-market-note">Tarif par palier · toujours sous Wave (2%) · Taux AFEX</div>
          </div>
        </div>
        <div class="tr-market-source">Source: World Bank Remittance Prices Q1 2026 · Moyenne Afrique subsaharienne : 7,8% · Zone XOF : ~4–5%</div>
      </div>

      <div class="tr-disclaimer">
        ⚠ Simulateur indicatif uniquement. Les taux sont basés sur les données de référence AFEX/WASI et ne constituent pas une offre de service financier.
        Toute activité de transfert de fonds est soumise à des obligations réglementaires (licence, KYC, AML).
        Source FX : ${fxSync.source === "live" ? "Frankfurter live" : fxSync.source === "cache" ? "Cache local" : "Référence intégrée"}.
      </div>
    </div>
  `;
}

function updateTransferQuote() {
  const amountEl = document.getElementById("tr-amount");
  const sendEl = document.getElementById("tr-send-currency");
  const receiveEl = document.getElementById("tr-receive-currency");
  const quoteEl = document.getElementById("tr-quote");
  if (!amountEl || !sendEl || !receiveEl || !quoteEl) return;

  const amount = parseFloat(amountEl.value) || 0;
  const sendCurrency = sendEl.value;
  const receiveCurrency = receiveEl.value;

  if (amount <= 0) {
    quoteEl.innerHTML = `<div class="tr-quote-placeholder">Entrez un montant pour voir le devis.</div>`;
    return;
  }

  const q = computeTransferQuote(amount, sendCurrency, receiveCurrency);
  if (!q) {
    quoteEl.innerHTML = `<div class="tr-quote-placeholder">Taux indisponibles pour ce corridor.</div>`;
    return;
  }

  const rateDisplay = (v) => v >= 1 ? v.toFixed(4) : v.toFixed(6);
  const feeDisplay = q.feeAmount >= 1 ? q.feeAmount.toFixed(2) : q.feeAmount.toFixed(4);

  quoteEl.innerHTML = `
    <div class="tr-quote-main">
      <div class="tr-quote-label">Montant reçu (estimé)</div>
      <div class="tr-quote-value">${fmtTransfer(q.receiveAmount, q.receiveCurrency)} ${q.receiveCurrency}</div>
    </div>
    <div class="tr-breakdown">
      <div class="tr-brow">
        <span>Taux mid-marché</span>
        <span>1 ${q.sendCurrency} = ${rateDisplay(q.midRateDirect)} ${q.receiveCurrency}</span>
      </div>
      <div class="tr-brow deduct">
        <span>Frais WASI (${pctLabel(q.pricing.feePct)}) · Palier ${q.pricing.label}</span>
        <span>− ${feeDisplay} ${q.sendCurrency}</span>
      </div>
      <div class="tr-brow deduct">
        <span>Marge FX (${pctLabel(q.pricing.fxMarginPct)})</span>
        <span>Taux appliqué : 1 ${q.sendCurrency} = ${rateDisplay(q.appliedRateDirect)} ${q.receiveCurrency}</span>
      </div>
      <div class="tr-brow total">
        <span>Coût total effectif</span>
        <span>${q.effectiveCostPct.toFixed(2)}%</span>
      </div>
    </div>
    <div class="tr-comparison">
      <div class="tr-comp-title">Comparaison estimée pour ${fmtTransfer(q.sendAmount, q.sendCurrency)} ${q.sendCurrency}</div>
      <div class="tr-comp-row other">
        <span class="tr-comp-name">Western Union</span>
        <span class="tr-comp-amount">≈ ${fmtTransfer(q.comparison.westernUnion.amount, q.receiveCurrency)} ${q.receiveCurrency}</span>
        <span class="tr-cost-badge high">${q.comparison.westernUnion.costPct}%</span>
      </div>
      <div class="tr-comp-row other">
        <span class="tr-comp-name">MoneyGram</span>
        <span class="tr-comp-amount">≈ ${fmtTransfer(q.comparison.moneyGram.amount, q.receiveCurrency)} ${q.receiveCurrency}</span>
        <span class="tr-cost-badge mid">${q.comparison.moneyGram.costPct}%</span>
      </div>
      <div class="tr-comp-row other">
        <span class="tr-comp-name">Wave / Sendwave</span>
        <span class="tr-comp-amount">≈ ${fmtTransfer(q.comparison.wave.amount, q.receiveCurrency)} ${q.receiveCurrency}</span>
        <span class="tr-cost-badge low">${q.comparison.wave.costPct}%</span>
      </div>
      <div class="tr-comp-row wasi">
        <span class="tr-comp-name">WASI Transfer</span>
        <span class="tr-comp-amount">${fmtTransfer(q.receiveAmount, q.receiveCurrency)} ${q.receiveCurrency}</span>
        <span class="tr-cost-badge best">${q.effectiveCostPct.toFixed(2)}%</span>
      </div>
    </div>
  `;
}

function bindTransfer() {
  ["tr-amount", "tr-send-currency", "tr-receive-currency"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener("input", updateTransferQuote); el.addEventListener("change", updateTransferQuote); }
  });
  updateTransferQuote();
}
