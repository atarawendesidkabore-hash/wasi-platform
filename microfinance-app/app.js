/**
 * CIREX Microfinance — portfolio and client scoring.
 *
 * PAR and client credit scores are computed by the shared AfriCredit engines
 * in ../lib/africredit, which the platform test suite covers (`npm test`).
 * The app must not re-implement that arithmetic: the investor projections
 * commit to PAR30 < 5%, so the number has to be computed, not asserted.
 */
import { generatePortfolioSummary } from "../lib/africredit/par-calculator.js";
import { calculateCreditScore } from "../lib/africredit/credit-scoring.js";
import {
  expiresWithinMonths,
  isDocumentExpired,
  isMinorOn,
  majorityDate,
  todayLocalIso
} from "../lib/africredit/calendar.js";
import {
  addMonths,
  firstDueDateForArrears,
  applyPayment,
  buildSchedule,
  deserialiseSchedule,
  scheduleArrears,
  schedulePrincipalOutstandingCentimes,
  serialiseSchedule
} from "../lib/africredit/amortisation.js";

/** PAR30 ceiling committed to in the investor projections. */
const PAR30_COVENANT_PCT = 5;

/**
 * Sovereign risk codes the credit engine knows. Declared HERE, at the top of the
 * module, because the seed portfolio below is built during module evaluation and
 * scores clients as it goes — a `const` declared further down sits in its
 * temporal dead zone at that moment and throws
 * "Cannot access 'SUPPORTED_COUNTRY_RISKS' before initialization".
 */
const SUPPORTED_COUNTRY_RISKS = new Set([
  "BJ", "BF", "CV", "CI", "GM", "GH", "GN", "GW",
  "LR", "ML", "MR", "NE", "NG", "SN", "SL", "TG"
]);

/** Display labels for the engine's cash-flow bands. Hoisted for the same reason. */
// Declared here, above init(): renderAll() runs during module evaluation and
// reaches vetoReasonFr(), so a const declared later sits in its temporal dead
// zone and throws "Cannot access 'VETO_REASONS_FR' before initialization".
/**
 * French wording for an AfriCredit veto.
 *
 * The engine's own reason strings stay in English on purpose: they are stable
 * identifiers, tests/africredit.test.mjs asserts on them, and they document the
 * equivalence with the React implementation the engine was harvested from.
 * Translating them there would break all three. So the boundary is here — the
 * engine states the rule, this maps it to what an officer reads.
 */
const VETO_REASONS_FR = {
  "Country under military transition": "Pays sous transition militaire",
  "Debt ratio above 80% threshold": "Charge de dette supérieure au seuil de 80 % du revenu",
  "Payment history below minimum threshold": "Historique de remboursement sous le seuil minimal",
  "Volatile cash flow combined with high debt ratio":
    "Trésorerie volatile combinée à une charge de dette élevée"
};

function vetoReasonFr(reason) {
  if (!reason) return "";
  return VETO_REASONS_FR[reason] || reason;
}

const CASH_FLOW_LABELS = {
  STABLE: "stable",
  VARIABLE: "variable",
  VOLATILE: "volatile"
};

/**
 * Seed fixture dates are relative to today. Hardcoded ones rot: the original
 * demo loans were due in March 2026, so once real days-past-due drove PAR the
 * whole fixture read as 140+ days late and PAR30 showed 100%.
 */
/**
 * Do NOT use this to place instalment dates. Day offsets and the schedule's
 * calendar-month steps are different units, and mixing them is what made the
 * fixture report different arrears in different months. Use
 * firstDueDateForArrears() for anything a schedule advances from; this helper is
 * for standalone dates such as repayment timestamps.
 */
function seedDueDate(offsetDays) {
  // Local setters, matching todayIso(): a fixture anchored on the UTC day while
  // arrears are measured against the local day is off by one for part of the day.
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return todayLocalIso(d);
}

const STORAGE_KEY = "cirex_microfinance_state_v2";
/** Append-only queue the client app files account-opening requests into. */
const APPLICATION_OUTBOX_KEY = "cirex_applications_v1";
const API_BASE = window.location.protocol === "file:" ? "http://localhost:3100" : "";
const SOURCE_STATUS_POLL_MS = 5 * 60 * 1000;
const INTEREST_CEILING_POLICY = [
  { minimumClients: 0, ceiling: 6, label: "Palier initial" },
  { minimumClients: 1000, ceiling: 9, label: "Palier croissance" },
  { minimumClients: 3000, ceiling: 12, label: "Palier maturité" }
];
const DEFAULT_INTEREST_RATE_CEILING = INTEREST_CEILING_POLICY[0].ceiling;
const MAX_INTEREST_RATE_CEILING = INTEREST_CEILING_POLICY[INTEREST_CEILING_POLICY.length - 1].ceiling;
const AI_EXAMPLES = [
  "La réglementation BCEAO sur la microfinance s'applique-t-elle au Sénégal ?",
  "Quels textes officiels sur la microfinance sont indexés pour le Burkina Faso ?",
  "La réglementation BCEAO sur la microfinance s'applique-t-elle au Nigeria ?",
  "Quel est le plafond interne de taux dans CIREX ?",
  "Quel dossier de crédit demande un suivi prioritaire aujourd'hui ?",
  "Que dois-je vérifier avant d'accorder un nouveau crédit en Côte d'Ivoire ?"
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

/**
 * Builds a demonstration loan whose arrears are stable on every date.
 *
 * The schedule is generated and its first `settled` instalments marked paid, so
 * the outstanding balance and the days past due follow from the engine rather
 * than from hand-tuned figures that drift the moment a rate or term changes.
 *
 * Each spec declares `oldestUnpaidDpd` — how many days past due its oldest
 * UNPAID instalment should be, negative meaning that many days before it falls
 * due — and firstDueDateForArrears() solves for the first due date that produces
 * it. Everything is relative to today, so the fixture cannot rot.
 *
 * Keep every `oldestUnpaidDpd` more than 3 days away from 0, 30, 60 and 90.
 * Month-end clamping can move the achieved value by a day or two, and those four
 * numbers are the Late/Current and PAR band boundaries: a target sitting on one
 * would let the loan change status with the month. A test in
 * tests/amortisation.test.mjs enforces this.
 */
function seedLoan(spec) {
  const today = todayIso();
  // Anchored on the arrears the fixture wants rather than on a raw day offset.
  // The old form picked firstDueDate = today - N days and let buildSchedule step
  // forward in calendar months, which made two loans flip status with month
  // length: LN-2016 and LN-2019 read Late during March and Watch/Current the
  // rest of the year, swinging reported late exposure by 96,9 %.
  const firstDueDate = firstDueDateForArrears({
    settledInstalments: spec.settled || 0,
    targetDaysPastDue: spec.oldestUnpaidDpd,
    today
  });
  let schedule = buildSchedule({
    principalCentimes: BigInt(spec.principal) * 100n,
    annualRatePct: spec.rate,
    termMonths: spec.term,
    firstDueDate
  });

  const alreadyPaid = schedule.instalments
    .slice(0, spec.settled || 0)
    .reduce((sum, instalment) => sum + instalment.totalDueCentimes, 0n);
  if (alreadyPaid > 0n) schedule = applyPayment(schedule, alreadyPaid).schedule;

  const arrears = scheduleArrears(schedule, today);

  return {
    id: spec.id,
    clientId: spec.clientId,
    branchId: spec.branchId,
    officerId: spec.officerId,
    purpose: spec.purpose,
    principal: spec.principal,
    guarantee: spec.guarantee,
    outstanding: Number(schedulePrincipalOutstandingCentimes(schedule) / 100n),
    interestRate: spec.rate,
    termMonths: spec.term,
    nextDueDate: arrears.nextDueDate || firstDueDate,
    status: arrears.overdueInstalments > 0 ? "Late" : spec.watch ? "Watch" : "Current",
    riskFlag: spec.riskFlag,
    schedule: serialiseSchedule(schedule)
  };
}

const seedState = {
  metadata: {
    institutionName: "CIREX Microfinance",
    institutionCountry: "Côte d’Ivoire",
    legalRegion: "UEMOA / BCEAO",
    baseCurrency: "XOF",
    // Relative like every other seed date: a hardcoded value here showed a
    // months-old "Mise à jour" beside arrears computed for today.
    lastUpdated: seedDueDate(0),
    interestCeilingCurrent: DEFAULT_INTEREST_RATE_CEILING
  },
  branches: [
    { id: "BR-01", name: "Abidjan Centre", region: "Abidjan" },
    { id: "BR-02", name: "Bouaké Marché", region: "Bouaké" },
    { id: "BR-03", name: "Daloa Terrain", region: "Daloa" }
  ],
  officers: [
    { id: "OF-01", name: "Jean Kouassi", branchId: "BR-01" },
    { id: "OF-02", name: "Awa Bamba", branchId: "BR-02" },
    { id: "OF-03", name: "Serge Yao", branchId: "BR-03" },
    { id: "OF-04", name: "Fatoumata Cissé", branchId: "BR-02" },
    { id: "OF-05", name: "Marc Adou", branchId: "BR-01" }
  ],
  clients: [
    { id: "CL-1001", name: "Aminata Kone", sector: "Commerce d'anacarde", region: "Bouaké", phone: "+225 0701010101", branchId: "BR-02", officerId: "OF-02", monthlyIncome: 340000, notes: "Présence solide sur le marché local." },
    { id: "CL-1002", name: "Kouadio N'Dri", sector: "Producteur de cacao", region: "Daloa", phone: "+225 0702020202", branchId: "BR-03", officerId: "OF-03", monthlyIncome: 240000, notes: "Trésorerie saisonnière à surveiller." },
    { id: "CL-1003", name: "Mariam Traore", sector: "Transformation d'huile de palme", region: "Yamoussoukro", phone: "+225 0703030303", branchId: "BR-01", officerId: "OF-01", monthlyIncome: 170000, notes: "Cliente en développement." },
    { id: "CL-1004", name: "Adjoua Bakayoko", sector: "Commerce de vivriers", region: "Abidjan", phone: "+225 0704040404", branchId: "BR-01", officerId: "OF-05", monthlyIncome: 395000, notes: "Cycle de rotation court, discipline régulière." },
    { id: "CL-1005", name: "Ibrahim Ouattara", sector: "Transport de marchandises", region: "Bouaké", phone: "+225 0705050505", branchId: "BR-02", officerId: "OF-04", monthlyIncome: 210000, notes: "Deux véhicules nantis." },
    { id: "CL-1006", name: "Salimata Diarra", sector: "Commerce de tissus", region: "Abidjan", phone: "+225 0706060606", branchId: "BR-01", officerId: "OF-01", monthlyIncome: 440000, notes: "Cliente fidèle, troisième cycle." },
    { id: "CL-1007", name: "Yao Kpangni", sector: "Producteur d'hévéa", region: "Daloa", phone: "+225 0707070707", branchId: "BR-03", officerId: "OF-03", monthlyIncome: 245000, notes: "Plantation en production." },
    { id: "CL-1008", name: "Fatou Sangare", sector: "Restauration de rue", region: "Bouaké", phone: "+225 0708080808", branchId: "BR-02", officerId: "OF-02", monthlyIncome: 155000, notes: "Recettes journalières stables." },
    { id: "CL-1009", name: "Bintou Coulibaly", sector: "Commerce de karité", region: "Bouaké", phone: "+225 0709090909", branchId: "BR-02", officerId: "OF-04", monthlyIncome: 360000, notes: "Groupement de dix femmes." },
    { id: "CL-1010", name: "Emmanuel Gbagbo", sector: "Menuiserie", region: "Abidjan", phone: "+225 0710101010", branchId: "BR-01", officerId: "OF-05", monthlyIncome: 185000, notes: "Atelier équipé, carnet de commandes." },
    { id: "CL-1011", name: "Rokia Sidibe", sector: "Commerce de poisson fumé", region: "Abidjan", phone: "+225 0711111111", branchId: "BR-01", officerId: "OF-01", monthlyIncome: 165000, notes: "Approvisionnement à San-Pédro." },
    { id: "CL-1012", name: "Seydou Bamba", sector: "Élevage de volaille", region: "Daloa", phone: "+225 0712121212", branchId: "BR-03", officerId: "OF-03", monthlyIncome: 460000, notes: "Deux bâtiments de mille sujets." },
    { id: "CL-1013", name: "Akissi Yapo", sector: "Coiffure et cosmétique", region: "Abidjan", phone: "+225 0713131313", branchId: "BR-01", officerId: "OF-05", monthlyIncome: 130000, notes: "Salon en zone dense." },
    { id: "CL-1014", name: "Mamadou Keita", sector: "Quincaillerie", region: "Bouaké", phone: "+225 0714141414", branchId: "BR-02", officerId: "OF-02", monthlyIncome: 190000, notes: "Stock diversifié." },
    { id: "CL-1015", name: "Djeneba Toure", sector: "Maraîchage", region: "Bouaké", phone: "+225 0715151515", branchId: "BR-02", officerId: "OF-04", monthlyIncome: 160000, notes: "Parcelle irriguée d'un hectare." },
    { id: "CL-1016", name: "Christelle Assi", sector: "Commerce de céréales", region: "Daloa", phone: "+225 0716161616", branchId: "BR-03", officerId: "OF-03", monthlyIncome: 205000, notes: "Stockage en magasin loué." },
    { id: "CL-1017", name: "Abdoulaye Sow", sector: "Réparation de motos", region: "Abidjan", phone: "+225 0717171717", branchId: "BR-01", officerId: "OF-01", monthlyIncome: 150000, notes: "Clientèle de taxis-motos." },
    { id: "CL-1018", name: "Nafissatou Diallo", sector: "Commerce d'anacarde", region: "Bouaké", phone: "+225 0718181818", branchId: "BR-02", officerId: "OF-02", monthlyIncome: 300000, notes: "Campagne d'achat en cours." },
    { id: "CL-1019", name: "Koffi Aboa", sector: "Producteur de cacao", region: "Daloa", phone: "+225 0719191919", branchId: "BR-03", officerId: "OF-03", monthlyIncome: 230000, notes: "Coopérative certifiée." },
    { id: "CL-1020", name: "Habiba Cisse", sector: "Boulangerie artisanale", region: "Abidjan", phone: "+225 0720202020", branchId: "BR-01", officerId: "OF-05", monthlyIncome: 195000, notes: "Four à gaz financé au cycle précédent." },
    { id: "CL-1021", name: "Awa Zongo", sector: "Commerce de savon", region: "Bouaké", phone: "+225 0721212121", branchId: "BR-02", officerId: "OF-04", monthlyIncome: 120000, notes: "Production artisanale et revente." },
    { id: "CL-1022", name: "Lucien Boni", sector: "Pêche lagunaire", region: "Abidjan", phone: "+225 0722222222", branchId: "BR-01", officerId: "OF-01", monthlyIncome: 210000, notes: "Pirogue motorisée nantie." }
  ],
  // 26 crédits sur 3 agences. Un seul dossier dépasse 30 jours de retard, ce
  // qui place le PAR30 sous l'engagement de 5 % — un portefeuille de trois
  // crédits ne pouvait pas le démontrer, un seul impayé y pesant 20 %.
  loans: [
    seedLoan({ id: "LN-2001", clientId: "CL-1001", branchId: "BR-02", officerId: "OF-02", purpose: "Campagne d'achat d'anacarde", principal: 850000, guarantee: 320000, rate: 5.5, term: 8, oldestUnpaidDpd: -6, settled: 2, riskFlag: "Low" }),
    seedLoan({ id: "LN-2002", clientId: "CL-1002", branchId: "BR-03", officerId: "OF-03", purpose: "Intrants agricoles", principal: 1200000, guarantee: 250000, rate: 6, term: 10, oldestUnpaidDpd: 9, settled: 2, riskFlag: "Medium" }),
    seedLoan({ id: "LN-2003", clientId: "CL-1003", branchId: "BR-01", officerId: "OF-01", purpose: "Matériel d'emballage", principal: 650000, guarantee: 90000, rate: 5.8, term: 6, oldestUnpaidDpd: 44, settled: 2, riskFlag: "High" }),
    seedLoan({ id: "LN-2004", clientId: "CL-1004", branchId: "BR-01", officerId: "OF-05", purpose: "Fonds de roulement vivriers", principal: 400000, guarantee: 120000, rate: 5.5, term: 6, oldestUnpaidDpd: -6, settled: 1, riskFlag: "Low" }),
    seedLoan({ id: "LN-2005", clientId: "CL-1005", branchId: "BR-02", officerId: "OF-04", purpose: "Réparation de camionnette", principal: 900000, guarantee: 450000, rate: 6, term: 12, oldestUnpaidDpd: -11, settled: 2, riskFlag: "Medium" }),
    seedLoan({ id: "LN-2006", clientId: "CL-1006", branchId: "BR-01", officerId: "OF-01", purpose: "Achat de tissus en gros", principal: 550000, guarantee: 180000, rate: 5.5, term: 8, oldestUnpaidDpd: -11, settled: 1, riskFlag: "Low" }),
    seedLoan({ id: "LN-2007", clientId: "CL-1007", branchId: "BR-03", officerId: "OF-03", purpose: "Entretien de plantation d'hévéa", principal: 750000, guarantee: 300000, rate: 5.8, term: 10, oldestUnpaidDpd: -22, settled: 2, riskFlag: "Low" }),
    seedLoan({ id: "LN-2008", clientId: "CL-1008", branchId: "BR-02", officerId: "OF-02", purpose: "Équipement de restauration", principal: 300000, guarantee: 90000, rate: 5.5, term: 6, oldestUnpaidDpd: -8, settled: 0, riskFlag: "Low" }),
    seedLoan({ id: "LN-2009", clientId: "CL-1009", branchId: "BR-02", officerId: "OF-04", purpose: "Crédit groupe karité", principal: 480000, guarantee: 150000, rate: 6, term: 8, oldestUnpaidDpd: -27, settled: 2, riskFlag: "Low" }),
    seedLoan({ id: "LN-2010", clientId: "CL-1010", branchId: "BR-01", officerId: "OF-05", purpose: "Machines de menuiserie", principal: 820000, guarantee: 400000, rate: 6, term: 12, oldestUnpaidDpd: -16, settled: 1, riskFlag: "Medium" }),
    seedLoan({ id: "LN-2011", clientId: "CL-1011", branchId: "BR-01", officerId: "OF-01", purpose: "Achat de poisson à San-Pédro", principal: 350000, guarantee: 100000, rate: 5.5, term: 6, oldestUnpaidDpd: -5, settled: 1, riskFlag: "Low" }),
    seedLoan({ id: "LN-2012", clientId: "CL-1012", branchId: "BR-03", officerId: "OF-03", purpose: "Provende et poussins", principal: 600000, guarantee: 200000, rate: 5.8, term: 8, oldestUnpaidDpd: -16, settled: 2, riskFlag: "Low" }),
    seedLoan({ id: "LN-2013", clientId: "CL-1013", branchId: "BR-01", officerId: "OF-05", purpose: "Fournitures de salon", principal: 280000, guarantee: 80000, rate: 5.5, term: 6, oldestUnpaidDpd: -12, settled: 0, riskFlag: "Low" }),
    seedLoan({ id: "LN-2014", clientId: "CL-1014", branchId: "BR-02", officerId: "OF-02", purpose: "Réassort de quincaillerie", principal: 700000, guarantee: 260000, rate: 6, term: 10, oldestUnpaidDpd: -9, settled: 1, riskFlag: "Medium" }),
    seedLoan({ id: "LN-2015", clientId: "CL-1015", branchId: "BR-02", officerId: "OF-04", purpose: "Système d'irrigation", principal: 520000, guarantee: 190000, rate: 5.8, term: 10, oldestUnpaidDpd: -13, settled: 1, riskFlag: "Low" }),
    seedLoan({ id: "LN-2016", clientId: "CL-1016", branchId: "BR-03", officerId: "OF-03", purpose: "Stock de céréales", principal: 640000, guarantee: 210000, rate: 6, term: 8, oldestUnpaidDpd: -7, settled: 1, watch: true, riskFlag: "Medium" }),
    seedLoan({ id: "LN-2017", clientId: "CL-1017", branchId: "BR-01", officerId: "OF-01", purpose: "Pièces détachées motos", principal: 320000, guarantee: 95000, rate: 5.5, term: 6, oldestUnpaidDpd: -5, settled: 0, riskFlag: "Low" }),
    seedLoan({ id: "LN-2018", clientId: "CL-1018", branchId: "BR-02", officerId: "OF-02", purpose: "Campagne anacarde 2026", principal: 780000, guarantee: 290000, rate: 5.8, term: 8, oldestUnpaidDpd: -19, settled: 1, riskFlag: "Low" }),
    seedLoan({ id: "LN-2019", clientId: "CL-1019", branchId: "BR-03", officerId: "OF-03", purpose: "Séchage et conditionnement cacao", principal: 950000, guarantee: 380000, rate: 6, term: 12, oldestUnpaidDpd: -9, settled: 2, riskFlag: "Medium" }),
    seedLoan({ id: "LN-2020", clientId: "CL-1020", branchId: "BR-01", officerId: "OF-05", purpose: "Matières premières boulangerie", principal: 430000, guarantee: 140000, rate: 5.5, term: 6, oldestUnpaidDpd: -5, settled: 1, riskFlag: "Low" }),
    seedLoan({ id: "LN-2021", clientId: "CL-1021", branchId: "BR-02", officerId: "OF-04", purpose: "Intrants savonnerie", principal: 260000, guarantee: 75000, rate: 5.5, term: 6, oldestUnpaidDpd: -15, settled: 0, riskFlag: "Low" }),
    seedLoan({ id: "LN-2022", clientId: "CL-1022", branchId: "BR-01", officerId: "OF-01", purpose: "Filets et moteur hors-bord", principal: 680000, guarantee: 250000, rate: 5.8, term: 10, oldestUnpaidDpd: -29, settled: 2, riskFlag: "Low" }),
    seedLoan({ id: "LN-2023", clientId: "CL-1004", branchId: "BR-01", officerId: "OF-05", purpose: "Extension de boutique", principal: 500000, guarantee: 170000, rate: 6, term: 8, oldestUnpaidDpd: -20, settled: 0, riskFlag: "Low" }),
    seedLoan({ id: "LN-2024", clientId: "CL-1009", branchId: "BR-02", officerId: "OF-04", purpose: "Deuxième cycle groupe karité", principal: 540000, guarantee: 185000, rate: 6, term: 8, oldestUnpaidDpd: -21, settled: 1, riskFlag: "Low" }),
    seedLoan({ id: "LN-2025", clientId: "CL-1012", branchId: "BR-03", officerId: "OF-03", purpose: "Bâtiment d'élevage", principal: 870000, guarantee: 330000, rate: 6, term: 12, oldestUnpaidDpd: -24, settled: 2, riskFlag: "Low" }),
    seedLoan({ id: "LN-2026", clientId: "CL-1006", branchId: "BR-01", officerId: "OF-01", purpose: "Stock saison des fêtes", principal: 460000, guarantee: 160000, rate: 5.5, term: 6, oldestUnpaidDpd: -6, settled: 0, riskFlag: "Low" })
  ],
  // Account-opening requests submitted from the client app. A prospect has no
  // client record yet, so the application carries everything an officer needs to
  // decide: the person, their declared income, and the credit they are asking
  // for. Approval creates the client AND the loan.
  applications: [
    {
      id: "AP-5001",
      name: "Safiatou Ouedraogo",
      phone: "+225 0709090909",
      region: "Abidjan",
      sector: "Commerce de pagnes",
      monthlyIncome: 180000,
      requestedAmount: 300000,
      requestedTermMonths: 6,
      purpose: "Stock de pagnes pour la saison des fêtes",
      guarantee: 90000,
      kyc: {
        idType: "CNI", idNumber: "CI0034872215", birthDate: "1989-04-12", idExpiry: "2031-04-11",
        addressCity: "Abidjan", addressDistrict: "Adjamé", addressLandmark: "Face au marché Gouro",
        addressProof: "Facture CIE",
        guarantorName: "Mariam Koffi", guarantorPhone: "+225 0755443322",
        guarantorRelation: "Associé", guarantorIdNumber: "CI0019887431"
      },
      submittedAt: seedDueDate(-2) + "T09:15:00.000Z",
      status: "pending",
      decidedAt: null,
      decidedBy: null,
      decisionNote: "",
      createdClientId: null,
      createdLoanId: null
    },
    {
      id: "AP-5002",
      name: "Issa Traoré",
      phone: "+225 0710101010",
      region: "Bouaké",
      sector: "Transport de marchandises",
      monthlyIncome: 95000,
      requestedAmount: 750000,
      requestedTermMonths: 12,
      purpose: "Achat d'un tricycle de livraison",
      guarantee: 40000,
      // Deliberately shows the checks working: the identity document expired
      // last month, so approval is blocked until it is renewed.
      kyc: {
        idType: "CNI", idNumber: "CI0027713904", birthDate: "1994-11-30", idExpiry: seedDueDate(-30),
        addressCity: "Bouaké", addressDistrict: "Air France 2", addressLandmark: "Près de la gare routière",
        addressProof: "Attestation de résidence",
        guarantorName: "Awa Bamba", guarantorPhone: "+225 0766554433",
        guarantorRelation: "Parent", guarantorIdNumber: "CI0041229087"
      },
      submittedAt: seedDueDate(-1) + "T16:40:00.000Z",
      status: "pending",
      decidedAt: null,
      decidedBy: null,
      decisionNote: "",
      createdClientId: null,
      createdLoanId: null
    }
  ],
  repayments: [
    { id: "RP-4001", loanId: "LN-2001", amount: 120000, paymentDate: seedDueDate(-3), note: "Encaissement en espèces" },
    { id: "RP-4002", loanId: "LN-2018", amount: 98000, paymentDate: seedDueDate(-4), note: "Paiement mobile money" },
    { id: "RP-4003", loanId: "LN-2009", amount: 62000, paymentDate: seedDueDate(-6), note: "Collecte de groupe" },
    { id: "RP-4004", loanId: "LN-2014", amount: 75000, paymentDate: seedDueDate(-7), note: "Encaissement guichet Bouaké" },
    { id: "RP-4005", loanId: "LN-2022", amount: 70000, paymentDate: seedDueDate(-9), note: "Versement après vente de pêche" },
    { id: "RP-4006", loanId: "LN-2007", amount: 82000, paymentDate: seedDueDate(-11), note: "Recette de saignée" },
    { id: "RP-4007", loanId: "LN-2019", amount: 90000, paymentDate: seedDueDate(-13), note: "Livraison coopérative" },
    { id: "RP-4008", loanId: "LN-2003", amount: 40000, paymentDate: seedDueDate(-16), note: "Remboursement partiel sur le terrain" }
  ]
};

let state = loadState();
const VIEW_LABELS = {
  overview: "Vue d'ensemble",
  clients: "Clients",
  loans: "Crédits",
  applications: "Demandes",
  repayments: "Remboursements",
  advisor: "Conseiller IA"
};

const STATUS_LABELS = {
  Current: "En cours",
  Watch: "Sous surveillance",
  Late: "En retard"
};

const RISK_LABELS = {
  Low: "Faible",
  Medium: "Moyen",
  High: "Élevé"
};

const viewMeta = {
  overview: "Suivez les signaux du portefeuille, la visibilité des agences, l'exposition des agents de crédit et la qualité des emprunteurs sur un seul écran.",
  clients: "Enregistrez les clients, rattachez-les à la bonne agence et gardez les notes de relation au plus près du portefeuille.",
  loans: `N'accordez de nouveaux crédits qu'après validation du contrôle IA sur le cadre juridique applicable à votre institution et sur le plafond interne progressif CIREX : ${describeInterestCeilingPolicy()}`,
  repayments: "Enregistrez les remboursements avec le même filtre de conformité pour garder les encaissements cohérents avec le portefeuille et la réglementation.",
  advisor: "Interrogez l'IA intégrée sur la réglementation microfinance africaine, la couverture pays, l'état des sources et les priorités du portefeuille."
};

const aiHistory = [];
let pendingManualLoanApproval = null;
let pendingManualRepaymentApproval = null;

const els = {
  marketTicker: document.getElementById("wasi-market-ticker-track"),
  marketTickerSecondary: document.getElementById("wasi-market-ticker-track-secondary"),
  viewTitle: document.getElementById("view-title"),
  viewDescription: document.getElementById("view-description"),
  institutionCard: document.getElementById("institution-card"),
  pulseCard: document.getElementById("pulse-card"),
  lastUpdated: document.getElementById("last-updated"),
  heroStrip: document.getElementById("hero-strip"),
  portfolioSpotlight: document.getElementById("portfolio-spotlight"),
  collectionSpotlight: document.getElementById("collection-spotlight"),
  officerGate: document.getElementById("officer-gate"),
  officerCodeInput: document.getElementById("officer-code-input"),
  officerCodeBtn: document.getElementById("officer-code-btn"),
  officerGateError: document.getElementById("officer-gate-error"),
  officerGateHint: document.getElementById("officer-gate-hint"),
  officerSignoutBtn: document.getElementById("officer-signout-btn"),
  appShell: document.getElementById("app-shell"),
  applicationList: document.getElementById("application-list"),
  applicationHistory: document.getElementById("application-history"),
  applicationsSummary: document.getElementById("applications-summary"),
  navItems: [...document.querySelectorAll(".nav-item")],
  views: [...document.querySelectorAll(".view")],
  statsGrid: document.getElementById("stats-grid"),
  riskList: document.getElementById("risk-list"),
  branchTable: document.getElementById("branch-table"),
  officerTable: document.getElementById("officer-table"),
  scoreTable: document.getElementById("score-table"),
  clientForm: document.getElementById("client-form"),
  clientBranchSelect: document.getElementById("client-branch-select"),
  clientOfficerSelect: document.getElementById("client-officer-select"),
  clientList: document.getElementById("client-list"),
  loanForm: document.getElementById("loan-form"),
  loanClientSelect: document.getElementById("loan-client-select"),
  loanBranchSelect: document.getElementById("loan-branch-select"),
  loanOfficerSelect: document.getElementById("loan-officer-select"),
  loanInterestInput: document.querySelector('#loan-form [name="interestRate"]'),
  loanComplianceCard: document.getElementById("loan-compliance-card"),
  loanSubmitBtn: document.getElementById("loan-submit-btn"),
  loanList: document.getElementById("loan-list"),
  repaymentForm: document.getElementById("repayment-form"),
  repaymentLoanSelect: document.getElementById("repayment-loan-select"),
  repaymentComplianceCard: document.getElementById("repayment-compliance-card"),
  repaymentSubmitBtn: document.getElementById("repayment-submit-btn"),
  repaymentList: document.getElementById("repayment-list"),
  resetBtn: document.getElementById("reset-btn"),
  exportBtn: document.getElementById("export-btn"),
  aiMetaPills: document.getElementById("ai-meta-pills"),
  aiExamples: document.getElementById("ai-example-prompts"),
  aiChatLog: document.getElementById("ai-chat-log"),
  aiForm: document.getElementById("ai-form"),
  aiQuestion: document.getElementById("ai-question"),
  aiSubmitBtn: document.getElementById("ai-submit-btn"),
  aiSourceTitle: document.getElementById("ai-source-title"),
  aiSourceDescription: document.getElementById("ai-source-description"),
  aiSourceLinks: document.getElementById("ai-source-links"),
  aiRefreshBtn: document.getElementById("ai-refresh-btn")
};

/**
 * Officer session.
 *
 * The console exposes every client's declared income, credit score and the whole
 * portfolio, so it is staff-only — a client tapping through from the mobile app
 * used to land here. Kept in sessionStorage rather than localStorage so closing
 * the tab ends the session.
 *
 * This is product separation, not security: the demo's data lives in
 * localStorage and any page on this origin can read it. Real enforcement needs
 * per-user auth and server-side scoping in the backend.
 */
const OFFICER_SESSION_KEY = "cirex_officer_session_v1";

function officerCodes() {
  // An officer signs in with their own staff id. Direction keeps a separate code
  // so supervisory access is distinguishable in the session record.
  const codes = state.officers.map((officer) => ({
    code: officer.id.toUpperCase(),
    name: officer.name,
    role: officer.role || "Agent de crédit"
  }));
  codes.push({ code: "DIR-01", name: "Direction CIREX", role: "Direction" });
  return codes;
}

function getOfficerSession() {
  try {
    const raw = sessionStorage.getItem(OFFICER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.code ? parsed : null;
  } catch (_) {
    return null;
  }
}

function setOfficerSession(entry) {
  try {
    sessionStorage.setItem(OFFICER_SESSION_KEY, JSON.stringify(entry));
  } catch (_) { /* private browsing: the gate simply reopens next load */ }
}

function clearOfficerSession() {
  try { sessionStorage.removeItem(OFFICER_SESSION_KEY); } catch (_) {}
}

function showOfficerGate() {
  if (els.officerGate) els.officerGate.hidden = false;
  if (els.appShell) els.appShell.hidden = true;
  if (els.officerGateHint) {
    els.officerGateHint.textContent =
      "Démonstration — codes valides : " + officerCodes().map((c) => c.code).join(", ") + ".";
  }
  if (els.officerCodeInput) els.officerCodeInput.focus();
}

function openConsole() {
  if (els.officerGate) els.officerGate.hidden = true;
  if (els.appShell) els.appShell.hidden = false;
}

function attemptOfficerSignIn() {
  const raw = String(els.officerCodeInput ? els.officerCodeInput.value : "").trim().toUpperCase();
  const match = officerCodes().find((entry) => entry.code === raw);
  if (!match) {
    if (els.officerGateError) {
      els.officerGateError.hidden = false;
      els.officerGateError.textContent = raw
        ? "Code agent inconnu. Si vous êtes client, utilisez l'application client."
        : "Saisissez votre code agent.";
    }
    return;
  }
  if (els.officerGateError) els.officerGateError.hidden = true;
  setOfficerSession({ code: match.code, name: match.name, role: match.role, since: new Date().toISOString() });
  openConsole();
  renderAll();
}

function bindOfficerGate() {
  if (els.officerCodeBtn) els.officerCodeBtn.addEventListener("click", attemptOfficerSignIn);
  if (els.officerCodeInput) {
    els.officerCodeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        attemptOfficerSignIn();
      }
    });
  }
  if (els.officerSignoutBtn) {
    els.officerSignoutBtn.addEventListener("click", () => {
      clearOfficerSession();
      if (els.officerCodeInput) els.officerCodeInput.value = "";
      showOfficerGate();
    });
  }
}

init();

function init() {
  // Pick up anything filed from the client app since this console last ran.
  if (drainApplicationInbox(state)) saveState();

  bindOfficerGate();
  if (getOfficerSession()) openConsole();
  else showOfficerGate();

  renderMarketTicker();
  bindNavigation();
  bindForms();
  bindActions();
  bindAi();
  renderAll();
  renderComplianceIdleStates();
  renderAiExamples();
  loadAiSourceDetails();
  startSourceStatusPolling();
}

function renderMarketTicker() {
  const html = WASI_MARKET_TICKER.map(
    (item) =>
      `<span class="wasi-market-ticker-item"><span class="sym">${item.symbol}</span><span class="val">${item.price}</span><span class="${item.change >= 0 ? "pos" : "neg"}">${item.change >= 0 ? "+" : ""}${item.change.toFixed(1)}%</span></span>`,
  ).join("");
  if (els.marketTicker) {
    els.marketTicker.innerHTML = `${html}${html}`;
  }
  if (els.marketTickerSecondary) {
    els.marketTickerSecondary.innerHTML = `${html}${html}`;
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return JSON.parse(JSON.stringify(seedState));
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return JSON.parse(JSON.stringify(seedState));
  }
}

/**
 * Moves account-opening requests submitted from the client app into state.
 *
 * The client app appends to its own key rather than writing the state document,
 * so it can never overwrite the portfolio. Draining is idempotent: an id already
 * present is skipped, which keeps an officer's decision from being reverted by a
 * stale copy still sitting in the queue.
 */
function drainApplicationInbox(targetState) {
  let inbound;
  try {
    inbound = JSON.parse(localStorage.getItem(APPLICATION_OUTBOX_KEY) || "[]");
  } catch (_) {
    return false;
  }
  if (!Array.isArray(inbound) || !inbound.length) return false;

  if (!Array.isArray(targetState.applications)) targetState.applications = [];
  const byId = new Map(targetState.applications.map((entry) => [entry.id, entry]));
  let added = 0;

  for (const entry of inbound) {
    if (!entry || !entry.id) continue;
    const existing = byId.get(entry.id);

    // Same reference AND same submission time: this is the request we already
    // drained, arriving again because the outbox is append-only. Skip it, which
    // is what keeps an officer's decision from being reverted by a stale copy.
    if (existing && existing.submittedAt === entry.submittedAt) continue;

    // Same reference, DIFFERENT submission: a genuine collision. The client app
    // numbers references without being able to see the console's own, so it can
    // reuse one. Re-key rather than skip — dropping it would lose a real request
    // silently, and the applicant is holding that reference.
    let id = entry.id;
    if (existing) {
      const highest = [...byId.keys()].reduce((max, key) => {
        const value = Number(String(key).split("-")[1]);
        return Number.isFinite(value) ? Math.max(max, value) : max;
      }, 5000);
      id = "AP-" + (highest + 1);
    }

    const drained = { ...entry, id, status: entry.status || "pending" };
    if (id !== entry.id) drained.clientReference = entry.id;
    targetState.applications.unshift(drained);
    byId.set(id, drained);
    added += 1;
  }
  return added > 0;
}

function normalizeState(saved) {
  const stateCopy = JSON.parse(JSON.stringify(seedState));
  Object.assign(stateCopy.metadata, saved.metadata || {});
  stateCopy.branches = Array.isArray(saved.branches) && saved.branches.length ? saved.branches : stateCopy.branches;
  stateCopy.officers = Array.isArray(saved.officers) && saved.officers.length ? saved.officers : stateCopy.officers;
  stateCopy.clients = Array.isArray(saved.clients) ? saved.clients.map((client, index) => ({
    ...client,
    branchId: client.branchId || stateCopy.branches[index % stateCopy.branches.length].id,
    officerId: client.officerId || stateCopy.officers[index % stateCopy.officers.length].id
  })) : stateCopy.clients;
  stateCopy.loans = Array.isArray(saved.loans) ? saved.loans.map((loan) => {
    const linkedClient = stateCopy.clients.find((client) => client.id === loan.clientId);
    return {
      ...loan,
      // Loans saved before the guarantee field existed have no collateral on
      // record. Default to 0 rather than inventing one: the client score then
      // reports "garantie non renseignee" instead of a fabricated figure.
      guarantee: Number(loan.guarantee) || 0,
      branchId: loan.branchId || linkedClient?.branchId || stateCopy.branches[0].id,
      officerId: loan.officerId || linkedClient?.officerId || stateCopy.officers[0].id
    };
  }) : stateCopy.loans;
  stateCopy.repayments = Array.isArray(saved.repayments) ? saved.repayments : stateCopy.repayments;
  // A file saved before onboarding existed has no applications key. Fall back to
  // the seed queue rather than an empty array, so the demo still shows the flow.
  stateCopy.applications = Array.isArray(saved.applications) ? saved.applications : stateCopy.applications;
  applyInterestCeilingPolicy(stateCopy);
  return stateCopy;
}

function saveState() {
  applyInterestCeilingPolicy(state);
  state.metadata.lastUpdated = todayIso();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getInterestCeilingStageForClientCount(clientCount) {
  const safeClientCount = Number.isFinite(Number(clientCount)) ? Number(clientCount) : 0;
  return INTEREST_CEILING_POLICY.reduce(
    (selectedStage, stage) => (safeClientCount >= stage.minimumClients ? stage : selectedStage),
    INTEREST_CEILING_POLICY[0]
  );
}

function getInterestCeilingStageForCeiling(ceiling) {
  const safeCeiling = Number.isFinite(Number(ceiling)) ? Number(ceiling) : DEFAULT_INTEREST_RATE_CEILING;
  return [...INTEREST_CEILING_POLICY]
    .reverse()
    .find((stage) => safeCeiling >= stage.ceiling) || INTEREST_CEILING_POLICY[0];
}

function applyInterestCeilingPolicy(targetState) {
  if (!targetState?.metadata) return targetState;

  const qualifiedStage = getInterestCeilingStageForClientCount(targetState.clients?.length || 0);
  const storedCeiling = Number(targetState.metadata.interestCeilingCurrent);
  const ratchetedCeiling = Math.max(
    qualifiedStage.ceiling,
    Number.isFinite(storedCeiling) ? storedCeiling : DEFAULT_INTEREST_RATE_CEILING
  );
  const currentCeiling = Math.min(ratchetedCeiling, MAX_INTEREST_RATE_CEILING);
  const currentStage = getInterestCeilingStageForCeiling(currentCeiling);

  targetState.metadata.interestCeilingCurrent = currentCeiling;
  targetState.metadata.interestCeilingUnlockedAtClients = currentStage.minimumClients;

  return targetState;
}

function getCurrentInterestCeiling() {
  const storedCeiling = Number(state.metadata?.interestCeilingCurrent);
  return Number.isFinite(storedCeiling) ? storedCeiling : DEFAULT_INTEREST_RATE_CEILING;
}

function getNextInterestCeilingStage() {
  const currentCeiling = getCurrentInterestCeiling();
  return INTEREST_CEILING_POLICY.find((stage) => stage.ceiling > currentCeiling) || null;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("fr-FR");
}

function describeInterestCeilingPolicy() {
  return "6% au départ, 9% dès 1 000 clients, puis 12% dès 3 000 clients. Une fois un palier atteint, il reste acquis.";
}

function getInterestCeilingStatusText() {
  const currentCeiling = getCurrentInterestCeiling();
  const nextStage = getNextInterestCeilingStage();

  if (nextStage) {
    return `Le plafond interne actif est de ${currentCeiling}%. Il passera à ${nextStage.ceiling}% lorsque CIREX atteindra ${formatCount(nextStage.minimumClients)} clients.`;
  }

  return `Le plafond interne actif est de ${currentCeiling}%. Le palier final de ${MAX_INTEREST_RATE_CEILING}% est acquis pour la suite des opérations.`;
}

function syncLoanInterestInput() {
  if (!els.loanInterestInput) return;

  const currentCeiling = getCurrentInterestCeiling();
  els.loanInterestInput.max = String(currentCeiling);
  els.loanInterestInput.title = `Plafond interne actuel : ${currentCeiling}%. ${describeInterestCeilingPolicy()}`;
}

function getViewLabel(viewKey) {
  return VIEW_LABELS[viewKey] || viewKey;
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || "-";
}

function getRiskLabel(riskFlag) {
  return RISK_LABELS[riskFlag] || riskFlag || "-";
}

function bindNavigation() {
  els.navItems.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.view;
      els.navItems.forEach((item) => item.classList.toggle("active", item === button));
      els.views.forEach((view) => view.classList.toggle("active", view.id === `view-${target}`));
      els.viewTitle.textContent = button.textContent;
      els.viewDescription.textContent = viewMeta[target] || "";
    });
  });
}

function bindForms() {
  els.clientForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    // Registering a client by hand must clear the same KYC bar as an approved
    // application, otherwise this form is simply a way around it.
    const candidate = {
      id: "(nouveau)",
      phone: String(form.get("phone") || "").trim(),
      kyc: {
        idType: String(form.get("idType") || "").trim(),
        idNumber: String(form.get("idNumber") || "").trim().toUpperCase(),
        birthDate: String(form.get("birthDate") || "").trim(),
        idExpiry: String(form.get("idExpiry") || "").trim(),
        addressCity: String(form.get("region") || "").trim(),
        addressDistrict: String(form.get("addressDistrict") || "").trim(),
        addressLandmark: String(form.get("addressLandmark") || "").trim(),
        addressProof: String(form.get("addressProof") || "").trim(),
        guarantorName: String(form.get("guarantorName") || "").trim(),
        guarantorPhone: String(form.get("guarantorPhone") || "").trim(),
        guarantorIdNumber: String(form.get("guarantorIdNumber") || "").trim().toUpperCase()
      }
    };
    const verdict = verifyKyc(candidate);
    if (!verdict.ok) {
      showToast("Enregistrement bloqué — " + verdict.blocking[0]);
      return;
    }

    state.clients.unshift({
      id: nextId("CL", state.clients, 1000),
      name: form.get("name").trim(),
      sector: form.get("sector").trim(),
      region: form.get("region").trim(),
      phone: form.get("phone").trim(),
      branchId: form.get("branchId"),
      officerId: form.get("officerId"),
      monthlyIncome: Math.max(0, Math.round(Number(form.get("monthlyIncome")) || 0)),
      kyc: {
        idType: String(form.get("idType") || "").trim(),
        idNumber: String(form.get("idNumber") || "").trim().toUpperCase(),
        birthDate: String(form.get("birthDate") || "").trim(),
        idExpiry: String(form.get("idExpiry") || "").trim(),
        addressCity: String(form.get("region") || "").trim(),
        addressDistrict: String(form.get("addressDistrict") || "").trim(),
        addressLandmark: String(form.get("addressLandmark") || "").trim(),
        addressProof: String(form.get("addressProof") || "").trim(),
        guarantorName: String(form.get("guarantorName") || "").trim(),
        guarantorPhone: String(form.get("guarantorPhone") || "").trim(),
        guarantorRelation: "",
        guarantorIdNumber: String(form.get("guarantorIdNumber") || "").trim().toUpperCase()
      },
      notes: form.get("notes").trim()
    });
    persistAndRefresh(event.currentTarget);
  });

  els.loanForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearPendingManualLoanApproval();
    const form = new FormData(event.currentTarget);
    const draft = buildLoanDraft(form);
    const compliance = await runComplianceCheck({
      operationType: "loan",
      operationData: draft,
      button: els.loanSubmitBtn,
      idleLabel: "Contrôler puis valider le crédit",
      loadingLabel: "Contrôle et validation...",
      resultCard: els.loanComplianceCard
    });

    if (!compliance) {
      clearPendingManualLoanApproval();
      return;
    }

    if (compliance.decision === "REVIEW") {
      queueManualLoanApproval(draft, compliance);
      renderComplianceResult(els.loanComplianceCard, buildPendingManualLoanReviewPayload(compliance));
      return;
    }

    if (compliance.decision !== "APPROVED") {
      clearPendingManualLoanApproval();
      return;
    }

    createLoanFromDraft(draft, { approvalMode: "auto", complianceDecision: compliance.decision });
    clearPendingManualLoanApproval();
    persistAndRefresh(event.currentTarget);
    renderComplianceResult(els.loanComplianceCard, {
      ...compliance,
      summary: `${compliance.summary} Le crédit a bien été validé et enregistré dans CIREX.`,
    });
  });

  els.repaymentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const draft = buildRepaymentDraft(form);
    const compliance = await runComplianceCheck({
      operationType: "repayment",
      operationData: draft,
      button: els.repaymentSubmitBtn,
      idleLabel: "Contrôler puis enregistrer le remboursement",
      loadingLabel: "Contrôle juridique...",
      resultCard: els.repaymentComplianceCard
    });

    if (!compliance) {
      clearPendingManualRepaymentApproval();
      return;
    }

    // A client has already handed over cash. If the legal filter could not run
    // we must not refuse to record it: route to human review, like a loan.
    if (compliance.decision === "REVIEW") {
      queueManualRepaymentApproval(draft, compliance);
      renderComplianceResult(
        els.repaymentComplianceCard,
        buildPendingManualRepaymentReviewPayload(compliance)
      );
      return;
    }

    if (compliance.decision !== "APPROVED") {
      clearPendingManualRepaymentApproval();
      return;
    }

    recordRepaymentFromDraft(draft, { approvalMode: "auto", complianceDecision: compliance.decision });
    clearPendingManualRepaymentApproval();
    persistAndRefresh(event.currentTarget);
    renderComplianceResult(els.repaymentComplianceCard, {
      ...compliance,
      summary: `${compliance.summary} Le remboursement a bien été enregistré dans CIREX.`,
    });
  });

  els.repaymentComplianceCard.addEventListener("click", (event) => {
    const button = event.target.closest("[data-manual-approve]");
    if (!button || !pendingManualRepaymentApproval) return;

    const confirmed = window.confirm(
      "Confirmez-vous que la revue manuelle est terminée et que vous souhaitez enregistrer ce remboursement dans CIREX ?"
    );
    if (!confirmed) return;

    const { draft, compliance } = pendingManualRepaymentApproval;
    recordRepaymentFromDraft(draft, {
      approvalMode: "manual-review",
      complianceDecision: compliance.technicalFailure ? "REVIEW_FILTRE_INDISPONIBLE" : compliance.decision
    });
    clearPendingManualRepaymentApproval();
    persistAndRefresh(els.repaymentForm);
    renderComplianceResult(els.repaymentComplianceCard, buildManualRepaymentApprovalPayload(compliance));
  });
}

function bindActions() {
  document.addEventListener("click", (event) => {
    const approve = event.target.closest("[data-approve-application]");
    if (approve) {
      approveApplication(approve.dataset.approveApplication);
      return;
    }
    const refuse = event.target.closest("[data-refuse-application]");
    if (refuse) refuseApplication(refuse.dataset.refuseApplication);
  });

  els.resetBtn.addEventListener("click", () => {
    state = JSON.parse(JSON.stringify(seedState));
    clearPendingManualLoanApproval();
    clearPendingManualRepaymentApproval();
    saveState();
    renderAll();
    renderComplianceIdleStates();
  });

  els.exportBtn.addEventListener("click", exportData);

  els.clientList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-print-client]");
    if (!button) return;
    printClientStatement(button.dataset.printClient);
  });

  els.repaymentList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-print-repayment]");
    if (!button) return;
    printRepaymentReceipt(button.dataset.printRepayment);
  });

  els.loanComplianceCard.addEventListener("click", (event) => {
    const button = event.target.closest("[data-manual-approve]");
    if (!button || !pendingManualLoanApproval) return;

    const confirmed = window.confirm(
      "Confirmez-vous que la revue manuelle du dossier est terminée et que vous souhaitez enregistrer ce crédit dans CIREX ?"
    );
    if (!confirmed) return;

    const { draft, compliance } = pendingManualLoanApproval;
    // Distinguish "the AI reviewed it and asked for a human" from "the AI never
    // ran". An auditor must be able to list every loan booked without the filter.
    createLoanFromDraft(draft, {
      approvalMode: "manual-review",
      complianceDecision: compliance.technicalFailure ? "REVIEW_FILTRE_INDISPONIBLE" : compliance.decision
    });
    clearPendingManualLoanApproval();
    persistAndRefresh(els.loanForm);
    renderComplianceResult(els.loanComplianceCard, buildManualLoanApprovalPayload(compliance));
  });
}

function clearPendingManualLoanApproval() {
  pendingManualLoanApproval = null;
}

function queueManualLoanApproval(draft, compliance) {
  pendingManualLoanApproval = {
    draft: JSON.parse(JSON.stringify(draft)),
    compliance: JSON.parse(JSON.stringify(compliance))
  };
}

function clearPendingManualRepaymentApproval() {
  pendingManualRepaymentApproval = null;
}

function queueManualRepaymentApproval(draft, compliance) {
  pendingManualRepaymentApproval = {
    draft: JSON.parse(JSON.stringify(draft)),
    compliance: JSON.parse(JSON.stringify(compliance))
  };
}

/**
 * Single place a repayment is written, so the automatic and manual-review
 * paths cannot drift apart in how they update the loan.
 */
function recordRepaymentFromDraft(draft, { approvalMode = "auto", complianceDecision = "APPROVED" } = {}) {
  state.repayments.unshift({
    id: nextId("RP", state.repayments, 4000),
    loanId: draft.loanId,
    amount: draft.amount,
    paymentDate: draft.paymentDate,
    note: draft.note,
    approvalMode,
    complianceDecision,
    manualReviewValidatedAt: approvalMode === "manual-review" ? new Date().toISOString() : null
  });

  const loan = state.loans.find((entry) => entry.id === draft.loanId);
  if (!loan) return;

  const schedule = loanSchedule(loan);
  if (schedule) {
    // Allocate to the oldest unpaid instalment, then DERIVE the balance, the
    // next due date and the status from the schedule.
    // Whole francs in, whole francs out: the XOF has no collectable subunit.
    const paidCentimes = BigInt(Math.round(draft.amount)) * 100n;
    const result = applyPayment(schedule, paidCentimes);
    persistLoanSchedule(loan, result.schedule);
    loan.outstanding = Number(schedulePrincipalOutstandingCentimes(result.schedule) / 100n);

    const arrears = scheduleArrears(result.schedule, todayIso());
    if (arrears.nextDueDate) loan.nextDueDate = arrears.nextDueDate;
    if (arrears.overdueInstalments > 0) loan.status = "Late";
    else if (loan.status === "Late") loan.status = "Current"; // leave "Watch" to the officer

    if (result.excessCentimes > 0n) {
      loan.prepaymentXof = (loan.prepaymentXof || 0) + Number(result.excessCentimes / 100n);
    }
  } else {
    // No schedule could be built. Reduce the balance and advance the due date by
    // one period, so a paying client stops accruing arrears forever.
    loan.outstanding = Math.max(0, loan.outstanding - draft.amount);
    loan.status = "Current";
    if (loan.nextDueDate) {
      try {
        loan.nextDueDate = addMonths(String(loan.nextDueDate).slice(0, 10), 1);
      } catch (_) { /* unparseable date: leave it for an officer to correct */ }
    }
  }

  if (loan.outstanding < loan.principal * 0.35) loan.riskFlag = "Low";
}

function buildPendingManualRepaymentReviewPayload(compliance) {
  const requiredActions = Array.isArray(compliance?.requiredActions)
    ? compliance.requiredActions.filter(Boolean)
    : [];

  return {
    ...compliance,
    requiredActions: [
      ...requiredActions,
      "Après votre revue humaine, utilisez le bouton ci-dessous pour enregistrer le remboursement dans CIREX."
    ].slice(0, 4),
    scopeNote: `${
      String(compliance?.scopeNote || "").trim() || "Le remboursement demande une revue humaine."
    } ${
      compliance?.technicalFailure
        ? "ATTENTION : le filtre juridique IA n'a pas été exécuté. Le client ayant déjà remis les fonds, enregistrez le remboursement après vérification manuelle."
        : "La validation manuelle portera sur le dernier remboursement contrôlé."
    }`,
    manualReviewAllowed: true,
    manualReviewLabel: "Valider le remboursement après revue manuelle"
  };
}

function buildManualRepaymentApprovalPayload(compliance) {
  return {
    ...compliance,
    decision: "APPROVED",
    summary: "Le remboursement a été enregistré dans CIREX après revue manuelle confirmée.",
    scopeNote:
      "Validation manuelle consignée. Conservez le reçu et les références réglementaires ayant motivé cette décision.",
    requiredActions: [
      "Archivez la note de revue manuelle avec le reçu de remboursement.",
      "Rejouez le contrôle automatique sur ce dossier dès que le serveur IA sera accessible."
    ],
    manualReviewAllowed: false,
    checkedAt: new Date().toISOString()
  };
}

function createLoanFromDraft(draft, { approvalMode = "auto", complianceDecision = "APPROVED" } = {}) {
  const loan = {
    id: nextId("LN", state.loans, 2000),
    clientId: draft.clientId,
    branchId: draft.branchId,
    officerId: draft.officerId,
    purpose: draft.purpose,
    principal: draft.principal,
    guarantee: draft.guarantee || 0,
    outstanding: draft.principal,
    interestRate: draft.interestRate,
    termMonths: draft.termMonths,
    nextDueDate: draft.nextDueDate,
    status: draft.status,
    riskFlag: draft.riskFlag,
    approvalMode,
    complianceDecision,
    manualReviewValidatedAt: approvalMode === "manual-review" ? new Date().toISOString() : null
  };

  // Build the amortisation schedule up front, so arrears and PAR are measured
  // per instalment from the first day of the loan.
  try {
    persistLoanSchedule(loan, buildSchedule({
      principalCentimes: BigInt(Math.round(loan.principal)) * 100n,
      annualRatePct: Number(loan.interestRate) || 0,
      termMonths: Number(loan.termMonths) || 1,
      firstDueDate: String(loan.nextDueDate).slice(0, 10)
    }));
    loan.scheduleBasis = "annuity";
  } catch (_) {
    loan.schedule = null; // terms rejected by the engine; falls back to the date model
  }

  state.loans.unshift(loan);
}

function buildPendingManualLoanReviewPayload(compliance) {
  const requiredActions = Array.isArray(compliance?.requiredActions) ? compliance.requiredActions.filter(Boolean) : [];

  return {
    ...compliance,
    requiredActions: [
      ...requiredActions,
      "Après votre revue humaine, utilisez le bouton ci-dessous pour valider et enregistrer le prêt dans CIREX."
    ].slice(0, 4),
    scopeNote: `${
      String(compliance?.scopeNote || "").trim() || "Le dossier demande une revue humaine."
    } ${
      compliance?.technicalFailure
        ? "ATTENTION : le filtre juridique IA n'a pas été exécuté sur ce dossier. Votre validation en tient lieu et sera tracée comme telle."
        : "La validation manuelle portera sur le dernier dossier contrôlé."
    }`,
    manualReviewAllowed: true,
    manualReviewLabel: "Valider le prêt après revue manuelle"
  };
}

function buildManualLoanApprovalPayload(compliance) {
  return {
    ...compliance,
    decision: "APPROVED",
    summary: "Le crédit a été enregistré dans CIREX après revue manuelle confirmée.",
    scopeNote:
      "Validation manuelle consignée dans le dossier. Conservez les pièces et les références réglementaires ayant motivé cette décision.",
    requiredActions: [
      "Archivez la note de revue manuelle dans le dossier crédit.",
      "Conservez les références réglementaires et les justificatifs avec le contrat."
    ],
    manualReviewAllowed: false,
    checkedAt: new Date().toISOString()
  };
}

function persistAndRefresh(form) {
  saveState();
  form.reset();
  renderAll();
}

function renderAll() {
  syncLoanInterestInput();
  renderShell();
  populateSelects();
  renderOverview();
  renderClients();
  renderLoans();
  renderApplications();
  renderRepayments();
}

function renderShell() {
  const activeView = getActiveViewKey();
  const outstanding = sum(state.loans.map((loan) => loan.outstanding));
  const totalRepaid = sum(state.repayments.map((repayment) => repayment.amount));
  const lateLoans = state.loans.filter((loan) => loanStatus(loan) === "Late");
  const watchLoans = state.loans.filter((loan) => loanStatus(loan) === "Watch");
  const currentInterestCeiling = getCurrentInterestCeiling();
  const nextInterestCeilingStage = getNextInterestCeilingStage();
  const nextDueLoan = [...state.loans]
    .filter((loan) => loan.nextDueDate)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))[0];
  const bestBranch = getBranchMetrics()[0];

  els.lastUpdated.textContent = `Mise à jour ${prettyDate(state.metadata.lastUpdated)}`;
  els.viewTitle.textContent = getViewLabel(activeView);
  els.viewDescription.textContent = viewMeta[activeView] || "";

  els.institutionCard.innerHTML = `
    <div class="eyebrow">Institution</div>
    <strong>${state.metadata.institutionName}</strong>
    <p>${state.branches.length} agences, ${state.officers.length} agents et ${state.clients.length} clients actifs dans un pilotage local unique.</p>
    <div class="signal-list">
      <div class="signal-row"><span>Pays</span><strong>${state.metadata.institutionCountry || "-"}</strong></div>
      <div class="signal-row"><span>Périmètre légal</span><strong>${state.metadata.legalRegion || "-"}</strong></div>
      <div class="signal-row"><span>Devise</span><strong>${state.metadata.baseCurrency}</strong></div>
      <div class="signal-row"><span>Plafond interne</span><strong>${currentInterestCeiling}%</strong></div>
      <div class="signal-row"><span>Prochain palier</span><strong>${nextInterestCeilingStage ? `${nextInterestCeilingStage.ceiling}% à ${formatCount(nextInterestCeilingStage.minimumClients)} clients` : "Palier final acquis"}</strong></div>
      <div class="signal-row"><span>Encours crédit</span><strong>${money(outstanding)}</strong></div>
      <div class="signal-row"><span>Total encaissé</span><strong>${money(totalRepaid)}</strong></div>
    </div>
  `;

  els.pulseCard.innerHTML = `
    <div class="eyebrow">Pulse Opérationnel</div>
    <strong>Priorité du jour</strong>
    <p>${lateLoans.length ? "Les dossiers en retard demandent une action immédiate." : "Aucun dossier en retard pour l'instant. La situation du portefeuille est plus sereine."}</p>
    <div class="signal-list">
      <div class="signal-row"><span>Dossiers en retard</span><strong>${lateLoans.length}</strong></div>
      <div class="signal-row"><span>Dossiers sous surveillance</span><strong>${watchLoans.length}</strong></div>
      <div class="signal-row"><span>Agence la plus solide</span><strong>${bestBranch?.branch.name || "-"}</strong></div>
      <div class="signal-row"><span>Contrôle juridique</span><strong>IA active</strong></div>
    </div>
  `;

  els.heroStrip.innerHTML = [
    {
      label: "Taille du portefeuille",
      value: money(outstanding),
      note: `${state.loans.length} crédits actifs répartis sur ${state.branches.length} agences.`
    },
    {
      label: "Flux d'encaissement",
      value: money(totalRepaid),
      note: `${state.repayments.length} remboursements déjà enregistrés dans CIREX.`
    },
    {
      label: "Prochaine échéance",
      value: nextDueLoan ? prettyDate(nextDueLoan.nextDueDate) : "Aucune échéance",
      note: nextDueLoan ? `${getClient(nextDueLoan.clientId)?.name || "Client inconnu"} · ${getStatusLabel(loanStatus(nextDueLoan))}` : "Créez un crédit pour lancer le calendrier d'échéances."
    }
  ].map((item) => `
    <article class="hero-mini-card">
      <div class="eyebrow">${item.label}</div>
      <strong>${item.value}</strong>
      <p>${item.note}</p>
    </article>
  `).join("");
}

function populateSelects() {
  const clientOptions = state.clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)} - ${escapeHtml(client.sector)}</option>`).join("");
  const branchOptions = state.branches.map((branch) => `<option value="${branch.id}">${branch.name} - ${branch.region}</option>`).join("");
  const officerOptions = state.officers.map((officer) => `<option value="${officer.id}">${officer.name} - ${getBranch(officer.branchId)?.name || officer.branchId}</option>`).join("");
  const loanOptions = state.loans.map((loan) => `<option value="${escapeHtml(loan.id)}">${escapeHtml(loan.id)} - ${escapeHtml(getClient(loan.clientId)?.name || "Client inconnu")}</option>`).join("");
  els.loanClientSelect.innerHTML = clientOptions;
  els.clientBranchSelect.innerHTML = branchOptions;
  els.loanBranchSelect.innerHTML = branchOptions;
  els.clientOfficerSelect.innerHTML = officerOptions;
  els.loanOfficerSelect.innerHTML = officerOptions;
  els.repaymentLoanSelect.innerHTML = loanOptions;
}

function renderOverview() {
  const outstanding = sum(state.loans.map((loan) => loan.outstanding));
  // PAR comes from the tested engine, driven by real days past due rather than
  // the manually set status flag.
  const par = portfolioSummary();
  const lateAmount = sum(state.loans.filter((loan) => loanStatus(loan) === "Late").map((loan) => loan.outstanding));
  const watchAmount = sum(state.loans.filter((loan) => loanStatus(loan) === "Watch").map((loan) => loan.outstanding));
  const totalCollected = sum(state.repayments.map((repayment) => repayment.amount));
  const lateLoans = state.loans.filter((loan) => loanStatus(loan) === "Late");
  const nextDueLoan = [...state.loans]
    .filter((loan) => loan.nextDueDate)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))[0];
  const stats = [
    { label: "Clients", value: String(state.clients.length), note: "Emprunteurs enregistrés" },
    { label: "Encours", value: money(outstanding), note: "Montant restant dû" },
    { label: "Retards", value: String(state.loans.filter((loan) => loanStatus(loan) === "Late").length), note: "Suivi immédiat requis" },
    { label: "PAR 30", value: pct(par.par30), note: "Moteur AfriCredit · plafond investisseur " + PAR30_COVENANT_PCT + " %" },
    { label: "PAR 60", value: pct(par.par60), note: "Impayés de plus de 60 jours" },
    { label: "PAR 90", value: pct(par.par90), note: "Impayés de plus de 90 jours" }
  ];
  els.statsGrid.innerHTML = stats.map((item) => `
    <article class="stat-card">
      <div class="eyebrow">${item.label}</div>
      <div class="stat-value">${item.value}</div>
      <div class="stat-note">${item.note}</div>
    </article>
  `).join("");

  els.portfolioSpotlight.innerHTML = `
    <div class="eyebrow">Focus Portefeuille</div>
    <h3>${lateLoans.length ? `${lateLoans.length} dossiers demandent une action directe` : "Le portefeuille est plus stable aujourd'hui"}</h3>
    <p>${lateLoans.length ? `${money(lateAmount)} se trouvent en retard et doivent passer en priorité dans le suivi agent et la revue d'agence.` : "Aucun dossier n'est actuellement dans le seau de retard, ce qui permet à l'équipe de se concentrer sur la discipline d'encaissement et le développement."}</p>
    <div class="pill-row">
      <span class="pill ${lateLoans.length ? "late" : "good"}">${lateLoans.length ? "Pression retard" : "Retards maîtrisés"}</span>
      <span class="pill ${watchAmount ? "watch" : "good"}">${watchAmount ? `${money(watchAmount)} sous surveillance` : "Surveillance légère"}</span>
      <span class="pill good">${pct(outstanding ? ((outstanding - lateAmount) / outstanding) * 100 : 100)} sain</span>
    </div>
  `;

  els.collectionSpotlight.innerHTML = `
    <div class="eyebrow">Focus Encaissement</div>
    <h3>${money(totalCollected)} encaissés à ce jour</h3>
    <p>${nextDueLoan ? `La prochaine collecte attendue est prévue le ${prettyDate(nextDueLoan.nextDueDate)} pour ${getClient(nextDueLoan.clientId)?.name || "Client inconnu"}.` : "Aucune prochaine échéance n'est encore enregistrée. Créez un crédit pour activer le cycle de remboursement."}</p>
    <div class="signal-list">
      <div class="signal-row"><span>Remboursements saisis</span><strong>${state.repayments.length}</strong></div>
      <div class="signal-row"><span>Score moyen client</span><strong>${averageScore().toFixed(0)} / 100</strong></div>
      <div class="signal-row"><span>Agents actifs</span><strong>${state.officers.length}</strong></div>
    </div>
  `;

  const covenantOk = par.par30 <= PAR30_COVENANT_PCT;
  const riskCards = [
    {
      title: "Engagement PAR30 < " + PAR30_COVENANT_PCT + " %",
      body: pct(par.par30) + " mesuré sur " + money(Number(par.activeExposureCentimes) / 100) + " d'encours vivant — "
        + (covenantOk ? "engagement respecté" : "engagement DÉPASSÉ, action requise")
        + ". Calculé par le moteur AfriCredit sur les jours de retard réels."
    },
    { title: "Exposition en retard", body: `${money(lateAmount)} se trouvent actuellement dans le seau de retard.` },
    { title: "Exposition sous surveillance", body: `${money(watchAmount)} sont actuellement sous surveillance.` },
    { title: "Score moyen client", body: `${averageScore().toFixed(0)} / 100 sur l'ensemble des clients.` }
  ];
  els.riskList.innerHTML = riskCards.map((item) => `<article class="stack-card"><strong>${item.title}</strong><div>${item.body}</div></article>`).join("");

  els.branchTable.innerHTML = renderTable(
    ["Agence", "Clients", "Encours", "Retards"],
    getBranchMetrics().map((item) => [item.branch.name, String(item.clientCount), money(item.outstanding), String(item.lateLoans)])
  );
  els.officerTable.innerHTML = renderTable(
    ["Agent", "Agence", "Encours", "Surveillance + retard"],
    getOfficerMetrics().map((item) => [item.officer.name, getBranch(item.officer.branchId)?.name || "-", money(item.outstanding), String(item.riskLoans)])
  );
  els.scoreTable.innerHTML = renderTable(
    ["Client", "Score", "Note", "Niveau de risque", "Retard max"],
    getClientScores().slice(0, 6).map((item) => [
      item.client.name,
      item.status === "INCOMPLET" ? "-" : String(item.score),
      item.grade,
      item.levelLabel,
      item.maxDpd > 0 ? item.maxDpd + " j" : "-"
    ])
  );
}

function renderClients() {
  els.clientList.innerHTML = state.clients.map((client) => {
    const score = scoreClient(client.id);
    const loanTotal = sum(state.loans.filter((loan) => loan.clientId === client.id).map((loan) => loan.outstanding));
    return `
      <article class="record-card">
        <header>
          <div>
            <h3>${escapeHtml(client.name)}</h3>
            <p>${escapeHtml(client.sector)} - ${escapeHtml(client.region)}</p>
          </div>
          <span class="pill ${score.pillClass}">Score ${score.score}</span>
        </header>
        <div class="record-row">
          <span class="muted">${escapeHtml(client.phone)}</span>
          <span class="muted">${client.id}</span>
        </div>
        <div class="record-row">
          <span>${getBranch(client.branchId)?.name || "Aucune agence"} / ${getOfficer(client.officerId)?.name || "Aucun agent"}</span>
          <span>Crédits ${money(loanTotal)}</span>
        </div>
        <div class="record-row">
          <span class="muted">Revenu declare ${client.monthlyIncome > 0 ? money(client.monthlyIncome) + "/mois" : "non renseigne"}</span>
          <span class="muted">Charge de dette ${score.monthlyDebtService > 0 ? money(score.monthlyDebtService) + "/mois - " + pct(round1(score.factors.debtRatio)) + " du revenu" : "aucune"}</span>
        </div>
        <div class="record-row">
          <span class="muted">Couverture garantie ${score.collateralCoverage !== null ? pct(round1(score.collateralCoverage)) + " du montant prete" : "-"}</span>
          <span class="muted">Tresorerie ${CASH_FLOW_LABELS[score.factors.cashFlowStability] || "-"}</span>
        </div>
        <div class="record-row">
          <span class="muted">${score.reason}</span>
          <span class="${score.levelClass}">${score.levelLabel}</span>
        </div>
        <div class="record-actions">
          <button class="ghost-btn" data-print-client="${client.id}">Imprimer la fiche</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderLoans() {
  els.loanList.innerHTML = state.loans.map((loan) => `
    <article class="record-card">
      <header>
        <div>
          <h3>${escapeHtml(getClient(loan.clientId)?.name || "Client inconnu")}</h3>
          <p>${escapeHtml(loan.purpose)}</p>
        </div>
        <span class="pill ${loanStatus(loan).toLowerCase()}">${getStatusLabel(loanStatus(loan))}</span>
      </header>
      <div class="record-row">
        <span>${money(loan.outstanding)} d'encours</span>
        <span class="pill ${loan.riskFlag.toLowerCase()}">Risque ${getRiskLabel(loan.riskFlag).toLowerCase()}</span>
      </div>
      <div class="record-row">
        <span>${getBranch(loan.branchId)?.name || "Aucune agence"} / ${getOfficer(loan.officerId)?.name || "Aucun agent"}</span>
        <span>Échéance ${prettyDate(loan.nextDueDate)}</span>
      </div>
      <div class="record-row">
        <span class="muted">${loan.interestRate}% sur ${loan.termMonths} mois</span>
        <span class="muted">Score client ${scoreClient(loan.clientId).score}</span>
      </div>
      ${renderLoanScheduleRow(loan)}
      ${
        loan.approvalMode === "manual-review"
          ? `
            <div class="record-row">
              <span class="pill review">Validation manuelle</span>
              ${
                loan.complianceDecision === "REVIEW_FILTRE_INDISPONIBLE"
                  ? `<span class="pill late">Filtre juridique IA non exécuté</span>`
                  : ""
              }
              <span class="muted">Revue confirmée le ${prettyDateTime(loan.manualReviewValidatedAt)}</span>
            </div>
          `
          : ""
      }
    </article>
  `).join("");
}

/** Instalment status line on a loan card: what is due, and what is late. */
function renderLoanScheduleRow(loan) {
  const arrears = loanArrears(loan);
  if (!arrears) {
    return `
      <div class="record-row">
        <span class="pill watch">Pas d'échéancier</span>
        <span class="muted">Arriérés estimés sur la seule date d'échéance</span>
      </div>
    `;
  }

  const count = arrears.schedule.instalments.length;
  const settledCount = arrears.schedule.instalments
    .filter((i) => i.paidCentimes >= i.totalDueCentimes).length;

  if (arrears.settled) {
    return `
      <div class="record-row">
        <span class="pill good">Échéancier soldé</span>
        <span class="muted">${count} échéances réglées</span>
      </div>
    `;
  }

  return `
    <div class="record-row">
      <span class="muted">Échéances ${settledCount}/${count} réglées</span>
      ${
        arrears.overdueInstalments > 0
          ? `<span class="pill late">${arrears.overdueInstalments} échéance${arrears.overdueInstalments > 1 ? "s" : ""} en retard · ${arrears.daysPastDue} j · ${money(Number(arrears.overdueCentimes) / 100)}</span>`
          : `<span class="pill good">À jour</span>`
      }
      <span class="muted">Prochaine échéance ${arrears.nextDueDate ? prettyDate(arrears.nextDueDate) : "-"}</span>
    </div>
  `;
}

/**
 * KYC verification on an account-opening request.
 *
 * Separates BLOCKING findings from warnings. A blocking finding stops the
 * approval outright — an expired identity document, an applicant who is not of
 * age, or a guarantor who is really the applicant are not judgement calls. A
 * warning is surfaced and left to the officer, because the right answer depends
 * on context they have and this code does not.
 *
 * Note on storage: identity numbers are sensitive personal data and this demo
 * keeps them in localStorage. In production they belong server-side, encrypted,
 * with a retention policy — see the note in RUNBOOK.md.
 */
function verifyKyc(application) {
  const kyc = (application && application.kyc) || {};
  const blocking = [];
  const warnings = [];
  // Local calendar, not UTC: the dates below come from <input type="date">, which
  // records the day the applicant sees. See lib/africredit/calendar.js.
  const today = todayIso();

  const required = [
    ["idType", "type de pièce"],
    ["idNumber", "numéro de pièce"],
    ["birthDate", "date de naissance"],
    ["idExpiry", "expiration de la pièce"],
    ["addressCity", "commune"],
    ["addressDistrict", "quartier"],
    ["guarantorName", "nom du garant"],
    ["guarantorPhone", "téléphone du garant"]
  ];
  const missing = required.filter(([key]) => !String(kyc[key] || "").trim()).map(([, label]) => label);
  if (missing.length) blocking.push("Pièces KYC manquantes : " + missing.join(", ") + ".");

  // Age of majority. Compared on calendar dates rather than by dividing days,
  // so a birthday that has not yet occurred this year counts correctly.
  if (kyc.birthDate) {
    if (isMinorOn(kyc.birthDate, today)) {
      blocking.push("Le demandeur est mineur (majorité atteinte le " + prettyDate(majorityDate(kyc.birthDate)) + ").");
    } else if (majorityDate(kyc.birthDate, 100) < today) {
      warnings.push("Date de naissance improbable : à vérifier.");
    }
  }

  if (kyc.idExpiry) {
    if (isDocumentExpired(kyc.idExpiry, today)) {
      blocking.push("Pièce d'identité expirée le " + prettyDate(kyc.idExpiry) + " : renouvellement requis.");
    } else if (expiresWithinMonths(kyc.idExpiry, today, 3)) {
      warnings.push("Pièce d'identité expirant le " + prettyDate(kyc.idExpiry) + " (moins de 3 mois).");
    }
  }

  // A guarantor who is the applicant provides no second recourse.
  const digits = (value) => String(value || "").replace(/\D/g, "");
  if (digits(kyc.guarantorPhone).length >= 8 && digits(kyc.guarantorPhone) === digits(application.phone)) {
    blocking.push("Le garant porte le même numéro que le demandeur.");
  }
  if (kyc.guarantorIdNumber && kyc.idNumber && kyc.guarantorIdNumber === kyc.idNumber) {
    blocking.push("Le garant présente la même pièce d'identité que le demandeur.");
  }

  if (!kyc.addressProof || kyc.addressProof === "Aucun") {
    warnings.push("Aucun justificatif de domicile présenté.");
  }
  if (!String(kyc.addressLandmark || "").trim()) {
    warnings.push("Aucun repère d'adresse : la visite terrain sera difficile.");
  }

  // An identity number already on file usually means this person is already a
  // client — approving would create a duplicate record and split their history.
  if (kyc.idNumber) {
    const existing = state.clients.find((client) => client.kyc && client.kyc.idNumber === kyc.idNumber);
    if (existing) {
      blocking.push("Cette pièce est déjà enregistrée pour " + existing.name + " (" + existing.id + ").");
    }
    const otherPending = getApplications().find((entry) => entry.id !== application.id
      && entry.status === "pending" && entry.kyc && entry.kyc.idNumber === kyc.idNumber);
    if (otherPending) warnings.push("Une autre demande en attente (" + otherPending.id + ") porte la même pièce.");
  }

  // Guarantor concentration: one person standing behind many loans is a single
  // point of failure the officer should see before adding another.
  if (kyc.guarantorIdNumber) {
    const backing = state.clients.filter((client) => client.kyc
      && client.kyc.guarantorIdNumber === kyc.guarantorIdNumber).length;
    if (backing >= 3) {
      warnings.push("Ce garant cautionne déjà " + backing + " clients : concentration à apprécier.");
    }
    const guarantorIsClient = state.clients.find((client) => client.kyc && client.kyc.idNumber === kyc.guarantorIdNumber);
    if (guarantorIsClient) {
      warnings.push("Le garant est lui-même client (" + guarantorIsClient.id + ") : vérifier sa propre charge.");
    }
  }

  return { blocking, warnings, ok: blocking.length === 0 };
}

/** KYC panel on an application card. */
function renderKycBlock(application) {
  const kyc = (application && application.kyc) || {};
  const verdict = verifyKyc(application);
  const rows = [
    ["Pièce", [kyc.idType, kyc.idNumber].filter(Boolean).join(" ") || "-"],
    ["Naissance", kyc.birthDate ? prettyDate(kyc.birthDate) : "-"],
    ["Expiration", kyc.idExpiry ? prettyDate(kyc.idExpiry) : "-"],
    ["Adresse", [kyc.addressDistrict, kyc.addressCity].filter(Boolean).join(", ") || "-"],
    ["Repère", kyc.addressLandmark || "-"],
    ["Justificatif", kyc.addressProof || "-"],
    ["Garant", [kyc.guarantorName, kyc.guarantorRelation ? "(" + kyc.guarantorRelation + ")" : ""].filter(Boolean).join(" ") || "-"],
    ["Tél. garant", kyc.guarantorPhone || "-"],
    ["Pièce garant", kyc.guarantorIdNumber || "-"]
  ];

  const findings = [
    ...verdict.blocking.map((item) => `<div class="kyc-finding blocking">${escapeHtml(item)}</div>`),
    ...verdict.warnings.map((item) => `<div class="kyc-finding warning">${escapeHtml(item)}</div>`)
  ].join("");

  return `
    <div class="kyc-block">
      <div class="kyc-head">
        <span class="eyebrow">Vérification KYC</span>
        <span class="pill ${verdict.ok ? "good" : "late"}">${verdict.ok ? "Recevable" : "Bloquant"}</span>
      </div>
      <div class="kyc-grid">
        ${rows.map(([label, value]) => `<div><span class="kyc-label">${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join("")}
      </div>
      ${findings || `<div class="kyc-finding ok">Aucune anomalie détectée.</div>`}
    </div>
  `;
}

/**
 * Scores an application BEFORE the client exists.
 *
 * scoreClient() needs a client record and its loans, which an applicant has
 * neither of. This runs the same AfriCredit engine on what the application
 * itself declares, so the officer sees a score and its vetoes at decision time
 * rather than discovering them after approving.
 *
 * paymentHistory is the one factor with no evidence: a first-time applicant has
 * no repayment record with us. It is set to 100 (no arrears observed) and
 * labelled as such in the UI — inventing a middling number would silently
 * penalise every newcomer.
 */
function scoreApplication(application) {
  const principal = Number(application.requestedAmount) || 0;
  const income = Number(application.monthlyIncome) || 0;
  const guarantee = Number(application.guarantee) || 0;
  const term = Math.max(1, Number(application.requestedTermMonths) || 6);
  const rate = state.metadata.interestCeilingCurrent || DEFAULT_INTEREST_RATE_CEILING;

  if (!(principal > 0) || !(income > 0)) {
    return { status: "INCOMPLET", reason: "Montant demandé ou revenu manquant.", monthlyInstalment: 0, debtRatio: 0 };
  }

  // Debt service on the requested credit, from the real amortisation engine.
  let monthlyInstalment = Math.round(principal / term);
  try {
    const schedule = buildSchedule({
      principalCentimes: BigInt(Math.round(principal)) * 100n,
      annualRatePct: rate,
      termMonths: term,
      firstDueDate: addMonths(todayIso(), 1)
    });
    monthlyInstalment = Number(schedule.instalments[0].totalDueCentimes / 100n);
  } catch (_) { /* fall back to the straight-line estimate above */ }

  const debtRatio = Math.max(0, Math.min(100, (monthlyInstalment / income) * 100));
  const sectorRisk = sectorRiskFor({ sector: application.sector });
  const factors = {
    paymentHistory: 100,
    debtRatio,
    sectorRisk,
    governanceScore: [application.phone, application.region, application.sector, application.purpose]
      .filter((value) => String(value || "").trim().length > 0).length * 25,
    collateralValue: guarantee,
    collateralFullScoreXof: principal,
    cashFlowStability: cashFlowStabilityFor({ sector: application.sector }, 0),
    countryRisk: countryRiskFor(null)
  };

  if (!(guarantee > 0)) {
    return {
      status: "INCOMPLET",
      reason: "Aucune garantie proposée : le score ne peut pas être calculé.",
      monthlyInstalment, debtRatio, factors
    };
  }

  const assessment = calculateCreditScore(factors);
  return {
    status: assessment.status,
    score: assessment.score,
    grade: assessment.grade,
    vetoReason: assessment.vetoReason,
    monthlyInstalment,
    debtRatio,
    factors
  };
}

/** Branch and officer for a new client: match the locality, then load-balance. */
function assignBranchAndOfficer(region) {
  const normalizedRegion = _normApplicationText(region);
  const branch = state.branches.find((entry) => _normApplicationText(entry.name).includes(normalizedRegion)
      || normalizedRegion.includes(_normApplicationText(entry.city || entry.name)))
    || state.branches.reduce((lightest, entry) => {
      const load = state.clients.filter((client) => client.branchId === entry.id).length;
      const bestLoad = state.clients.filter((client) => client.branchId === lightest.id).length;
      return load < bestLoad ? entry : lightest;
    }, state.branches[0]);

  const branchOfficers = state.officers.filter((officer) => officer.branchId === branch.id);
  const pool = branchOfficers.length ? branchOfficers : state.officers;
  const officer = pool.reduce((lightest, entry) => {
    const load = state.loans.filter((loan) => loan.officerId === entry.id).length;
    const bestLoad = state.loans.filter((loan) => loan.officerId === lightest.id).length;
    return load < bestLoad ? entry : lightest;
  }, pool[0]);

  return { branchId: branch.id, officerId: officer.id };
}

function _normApplicationText(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function getApplications() {
  return Array.isArray(state.applications) ? state.applications : [];
}

/**
 * Approves an application: creates the client, then the loan.
 *
 * Both in one step because a microfinance applicant is asking for money, not for
 * membership — registering the person without the credit they applied for would
 * leave the request half-served.
 */
function approveApplication(applicationId) {
  const application = getApplications().find((entry) => entry.id === applicationId);
  if (!application || application.status !== "pending") return;

  // KYC first: an identity that does not check out is not a credit decision.
  const kycVerdict = verifyKyc(application);
  if (!kycVerdict.ok) {
    showToast("Approbation bloquée — " + kycVerdict.blocking[0]);
    return;
  }

  const assessment = scoreApplication(application);
  if (assessment.status === "INCOMPLET") {
    showToast("Dossier incomplet : " + assessment.reason);
    return;
  }

  const session = getOfficerSession();
  const { branchId, officerId } = assignBranchAndOfficer(application.region);

  const client = {
    id: nextId("CL", state.clients, 1000),
    name: application.name,
    sector: application.sector,
    region: application.region,
    phone: application.phone,
    branchId,
    officerId,
    monthlyIncome: Number(application.monthlyIncome) || 0,
    // Kept on the client so the identity and guarantor stay on file, and so the
    // duplicate-piece check has something to match future applications against.
    kyc: { ...(application.kyc || {}) },
    notes: `Ouverture de compte ${application.id} validée le ${prettyDate(todayIso())}.`
  };
  state.clients.unshift(client);

  const rate = state.metadata.interestCeilingCurrent || DEFAULT_INTEREST_RATE_CEILING;
  createLoanFromDraft({
    clientId: client.id,
    clientName: client.name,
    clientSector: client.sector,
    branchId,
    branchName: getBranch(branchId)?.name || branchId,
    officerId,
    officerName: getOfficer(officerId)?.name || officerId,
    purpose: application.purpose,
    principal: Number(application.requestedAmount) || 0,
    guarantee: Number(application.guarantee) || 0,
    interestRate: rate,
    termMonths: Math.max(1, Number(application.requestedTermMonths) || 6),
    nextDueDate: addMonths(todayIso(), 1),
    status: "Current",
    riskFlag: assessment.score >= 75 ? "Low" : assessment.score >= 50 ? "Medium" : "High"
  }, { approvalMode: "manual-review", complianceDecision: "APPROVED" });

  application.status = "approved";
  application.decidedAt = new Date().toISOString();
  application.decidedBy = session ? `${session.name} (${session.code})` : "Console";
  application.createdClientId = client.id;
  application.createdLoanId = state.loans[0] ? state.loans[0].id : null;
  application.decisionNote = `Score AfriCredit ${assessment.score} (${assessment.grade}).`
    + (kycVerdict.warnings.length ? ` Réserves KYC acceptées : ${kycVerdict.warnings.join(" ")}` : "");

  saveState();
  renderAll();
  showToast(`${client.name} est cliente : ${client.id} et crédit ${application.createdLoanId}.`);
}

function refuseApplication(applicationId) {
  const application = getApplications().find((entry) => entry.id === applicationId);
  if (!application || application.status !== "pending") return;
  const reason = window.prompt("Motif du refus (communiqué au demandeur) :", "");
  if (reason === null) return;
  const session = getOfficerSession();
  application.status = "refused";
  application.decidedAt = new Date().toISOString();
  application.decidedBy = session ? `${session.name} (${session.code})` : "Console";
  application.decisionNote = String(reason).trim() || "Sans motif précisé.";
  saveState();
  renderAll();
  showToast("Demande refusée.");
}

function renderApplications() {
  if (!els.applicationList) return;
  const applications = getApplications();
  const pending = applications.filter((entry) => entry.status === "pending");
  const decided = applications.filter((entry) => entry.status !== "pending");

  if (els.applicationsSummary) {
    els.applicationsSummary.textContent = pending.length
      ? `${pending.length} demande${pending.length > 1 ? "s" : ""} en attente. L'approbation crée le client et met en place le crédit demandé.`
      : "Aucune demande en attente.";
  }

  els.applicationList.innerHTML = pending.length
    ? pending.map((application) => {
        const assessment = scoreApplication(application);
        const scoreLine = assessment.status === "INCOMPLET"
          ? `<span class="pill watch">Dossier incomplet</span><span class="muted">${assessment.reason}</span>`
          : assessment.status === "VETOED"
            ? `<span class="pill late">Veto AfriCredit</span><span class="muted">${escapeHtml(vetoReasonFr(assessment.vetoReason))}</span>`
            : `<span class="pill ${assessment.score >= 75 ? "good" : "watch"}">Score ${assessment.score} · ${assessment.grade}</span>
               <span class="muted">Mensualité ${money(assessment.monthlyInstalment)} — ${pct(round1(assessment.debtRatio))} du revenu</span>`;
        return `
      <article class="record-card">
        <header>
          <div>
            <h3>${escapeHtml(application.name)}</h3>
            <p>${escapeHtml(application.sector)} - ${escapeHtml(application.region)}</p>
          </div>
          <span class="pill watch">${application.id}</span>
        </header>
        <div class="record-row">
          <span>${money(application.requestedAmount)} demandés sur ${application.requestedTermMonths} mois</span>
          <span class="muted">${escapeHtml(application.phone)}</span>
        </div>
        <div class="record-row">
          <span class="muted">Revenu déclaré ${money(application.monthlyIncome)}/mois</span>
          <span class="muted">Garantie proposée ${money(application.guarantee)}</span>
        </div>
        <div class="record-row">${scoreLine}</div>
        <div class="record-row">
          <span class="muted">${escapeHtml(application.purpose)}</span>
          <span class="muted">Reçue ${prettyDateTime(application.submittedAt)}</span>
        </div>
        ${application.clientReference ? `
        <div class="record-row">
          <span class="pill watch">Réf. donnée au client : ${escapeHtml(application.clientReference)}</span>
          <span class="muted">Renumérotée à l'arrivée (référence déjà utilisée)</span>
        </div>` : ""}
        <div class="record-row">
          <span class="muted">Historique de remboursement : aucun antécédent chez nous (premier crédit)</span>
        </div>
        ${renderKycBlock(application)}
        <div class="record-actions">
          <button class="primary-btn" data-approve-application="${application.id}">Approuver et ouvrir le crédit</button>
          <button class="ghost-btn" data-refuse-application="${application.id}">Refuser</button>
        </div>
      </article>
    `;
      }).join("")
    : `<div class="detail-card"><strong>File vide</strong><p class="detail-copy">Les demandes envoyées depuis l'application client apparaissent ici.</p></div>`;

  if (els.applicationHistory) {
    els.applicationHistory.innerHTML = decided.length
      ? decided
          .slice()
          .sort((a, b) => String(b.decidedAt || "").localeCompare(String(a.decidedAt || "")))
          .map((application) => `
        <article class="record-card">
          <header>
            <div>
              <h3>${escapeHtml(application.name)}</h3>
              <p>${application.id} - ${escapeHtml(application.decidedBy || "")}</p>
            </div>
            <span class="pill ${application.status === "approved" ? "good" : "late"}">${application.status === "approved" ? "Approuvée" : "Refusée"}</span>
          </header>
          <div class="record-row">
            <span class="muted">${escapeHtml(application.decisionNote || "")}</span>
            <span class="muted">${application.decidedAt ? prettyDateTime(application.decidedAt) : "-"}</span>
          </div>
          ${application.createdClientId ? `<div class="record-row"><span class="muted">Client ${application.createdClientId}</span><span class="muted">Crédit ${application.createdLoanId || "-"}</span></div>` : ""}
        </article>
      `).join("")
      : `<div class="detail-card"><strong>Aucune décision</strong><p class="detail-copy">L'historique des approbations et des refus s'affiche ici.</p></div>`;
  }
}

function renderRepayments() {
  els.repaymentList.innerHTML = state.repayments.slice(0, 12).map((repayment) => {
    const loan = state.loans.find((entry) => entry.id === repayment.loanId);
    const client = loan ? getClient(loan.clientId) : null;
    return `
      <article class="record-card">
        <header>
          <div>
            <h3>${client?.name || "Client inconnu"}</h3>
            <p>${repayment.note}</p>
          </div>
          <span class="pill good">${prettyDate(repayment.paymentDate)}</span>
        </header>
        <div class="record-row">
          <span>${repayment.loanId}</span>
          <span>${money(repayment.amount)}</span>
        </div>
        ${
          repayment.approvalMode === "manual-review"
            ? `
              <div class="record-row">
                <span class="pill review">Validation manuelle</span>
                ${
                  repayment.complianceDecision === "REVIEW_FILTRE_INDISPONIBLE"
                    ? `<span class="pill late">Filtre juridique IA non exécuté</span>`
                    : ""
                }
                <span class="muted">Revue confirmée le ${prettyDateTime(repayment.manualReviewValidatedAt)}</span>
              </div>
            `
            : ""
        }
        <div class="record-actions">
          <button class="ghost-btn" data-print-repayment="${repayment.id}">Imprimer le reçu</button>
        </div>
      </article>
    `;
  }).join("");
}

/**
 * Generic table renderer.
 *
 * Escapes every cell. The score table feeds it client names, which since
 * onboarding can originate from an outsider's account-opening request — an
 * unescaped name of <img src=x onerror=...> executed in the officer's session.
 * All three callers pass plain text (names, money(), String()), so escaping here
 * is safe and covers them together.
 */
function renderTable(headers, rows) {
  return [
    `<div class="table-row header">${headers.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`,
    ...rows.map((row) => `<div class="table-row">${row.map((cell) => `<span>${escapeHtml(cell)}</span>`).join("")}</div>`)
  ].join("");
}

function getBranchMetrics() {
  return state.branches.map((branch) => {
    const clients = state.clients.filter((client) => client.branchId === branch.id);
    const loans = state.loans.filter((loan) => loan.branchId === branch.id);
    return {
      branch,
      clientCount: clients.length,
      outstanding: sum(loans.map((loan) => loan.outstanding)),
      lateLoans: loans.filter((loan) => loanStatus(loan) === "Late").length
    };
  }).sort((a, b) => b.outstanding - a.outstanding);
}

function getOfficerMetrics() {
  return state.officers.map((officer) => {
    const loans = state.loans.filter((loan) => loan.officerId === officer.id);
    return {
      officer,
      outstanding: sum(loans.map((loan) => loan.outstanding)),
      riskLoans: loans.filter((loan) => loan.status === "Watch" || loan.status === "Late").length
    };
  }).sort((a, b) => b.outstanding - a.outstanding);
}

/* -- AfriCredit bridge ----------------------------------------------------
   The app records a status flag and a due date; AfriCredit needs days past
   due and money in centimes. These adapters do only that conversion, so the
   scoring arithmetic stays in the tested library. */

/**
 * Today, on the user's own calendar.
 *
 * Every date this app compares against — instalment due dates, identity document
 * expiry, dates of birth — is a bare calendar date. Deriving today from
 * toISOString() gave the UTC date instead, which is a different day for part of
 * every day in Lagos (UTC+1) and Nairobi (UTC+3), both inside our coverage. That
 * accepted expired identity documents and declared adults minors.
 */
function todayIso() {
  return todayLocalIso();
}

/**
 * The loan's amortisation schedule.
 *
 * Stored schedules are deserialised. A loan without one — seed data, or a file
 * created before schedules existed — is reconstructed from its terms, and the
 * amount already repaid (principal minus outstanding) is applied to it so the
 * schedule agrees with the balance on record.
 *
 * Never cache the result on the loan object: schedules hold bigints and
 * `JSON.stringify` throws on those, which would break saveState().
 */
function loanSchedule(loan) {
  const stored = deserialiseSchedule(loan.schedule);
  if (stored) return stored;

  const firstDueDate = String(loan.nextDueDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate)) return null;

  try {
    let schedule = buildSchedule({
      principalCentimes: BigInt(Math.round(loan.principal || 0)) * 100n,
      annualRatePct: Number(loan.interestRate) || 0,
      termMonths: Number(loan.termMonths) || 1,
      firstDueDate
    });
    const alreadyRepaid = Math.max(0, Math.round((loan.principal || 0) - (loan.outstanding || 0)));
    if (alreadyRepaid > 0) {
      schedule = applyPayment(schedule, BigInt(alreadyRepaid) * 100n).schedule;
    }
    return schedule;
  } catch (_) {
    return null;
  }
}

function persistLoanSchedule(loan, schedule) {
  loan.schedule = serialiseSchedule(schedule);
}

/**
 * Days past due, measured against the oldest UNPAID INSTALMENT.
 *
 * The previous version compared today with a single `nextDueDate` that no
 * repayment ever moved, so a paying client stayed permanently in arrears and
 * PAR could never come down. Loans with no reconstructable schedule fall back
 * to that older behaviour rather than reporting a falsely clean 0.
 */
function loanDaysPastDue(loan, today = new Date()) {
  const schedule = loanSchedule(loan);
  if (schedule) {
    return scheduleArrears(schedule, todayLocalIso(today)).daysPastDue;
  }
  if (!loan.nextDueDate) return 0;
  const due = new Date(loan.nextDueDate + "T00:00:00Z");
  if (Number.isNaN(due.getTime())) return 0;
  const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return days > 0 ? days : 0;
}

/**
 * The loan monthly instalment: the next unpaid one, or the last if settled.
 *
 * Falls back to a straight-line estimate when no schedule can be built, so a
 * loan with unparseable terms still contributes to the debt-service ratio
 * instead of silently counting as zero - an omission would flatter the client.
 */
function loanMonthlyInstalment(loan) {
  const schedule = loanSchedule(loan);
  if (schedule) {
    const next = schedule.instalments.find((i) => i.paidCentimes < i.totalDueCentimes);
    const instalment = next || schedule.instalments[schedule.instalments.length - 1];
    if (instalment) return Number(instalment.totalDueCentimes / 100n);
  }
  const term = Number(loan.termMonths) || 1;
  return Math.round((Number(loan.principal) || 0) / term);
}

/**
 * Monthly debt service across a client live loans.
 *
 * Settled loans are excluded: a repaid credit is no longer a claim on income.
 */
function clientMonthlyDebtService(loans) {
  return sum(loans
    .filter((loan) => (Number(loan.outstanding) || 0) > 0)
    .map(loanMonthlyInstalment));
}

/**
 * The loan's status as of today, derived rather than trusted.
 *
 * `loan.status` is a snapshot: seedLoan writes it once, and a repayment rewrites
 * it, but nothing recomputes it as time passes. PAR, meanwhile, is measured live
 * off the schedule. Left alone the two drift apart — an instalment falls due, PAR
 * moves, and the "Retards" tile still reads the old number.
 *
 * Arrears decide "Late". "Watch" stays an officer judgement and is preserved from
 * the stored value; anything else with no overdue instalment is "Current".
 */
function loanStatus(loan) {
  if (!loan) return "Current";
  if (loanDaysPastDue(loan) > 0) return "Late";
  return loan.status === "Watch" ? "Watch" : "Current";
}

/** Instalment-level arrears summary for display. Null when no schedule. */
function loanArrears(loan) {
  const schedule = loanSchedule(loan);
  if (!schedule) return null;
  return { ...scheduleArrears(schedule, todayIso()), schedule };
}

/** Maps app loans onto the AfriCredit Loan shape (bigint centimes). */
function toAfriCreditLoans(loans, today = new Date()) {
  return loans.map((loan) => ({
    id: loan.id,
    disbursedAmount: BigInt(Math.round(loan.principal || 0)) * 100n,
    outstandingBalance: BigInt(Math.round(loan.outstanding || 0)) * 100n,
    daysPastDue: loanDaysPastDue(loan, today),
    status: (loan.outstanding || 0) <= 0 ? "REPAID" : "ACTIVE"
  }));
}

/** Portfolio summary (PAR30/60/90) from the tested engine. */
function portfolioSummary() {
  return generatePortfolioSummary(toAfriCreditLoans(state.loans));
}

/** Sector risk band derived from the client's declared sector. */
function sectorRiskFor(client) {
  const sector = String(client && client.sector ? client.sector : "").toLowerCase();
  if (/transformation|industrie|usine/.test(sector)) return "HIGH";
  if (/cacao|anacarde|palme|agricole|producteur|intrant/.test(sector)) return "MEDIUM";
  if (/commerce|service|boutique|transport/.test(sector)) return "LOW";
  return "MEDIUM";
}

/**
 * Cash-flow stability for the credit engine.
 *
 * Arrears dominate: a client 30+ days late has demonstrated volatile cash flow
 * whatever their sector. Otherwise it follows sector risk in the SAME direction -
 * higher sector risk means less predictable receipts.
 *
 * The previous version read `sectorRisk === "MEDIUM" ? "VARIABLE" : "STABLE"`,
 * which handed HIGH-risk sectors the top STABLE score of 100 and penalised only
 * MEDIUM ones. That clawed back 4,0 of the 4,5 points the sector factor is meant
 * to separate them by, leaving an industrial transformation client and a trader
 * half a point apart.
 */
function cashFlowStabilityFor(client, maxDpd) {
  if (maxDpd >= 30) return "VOLATILE";
  const sectorRisk = sectorRiskFor(client);
  if (sectorRisk === "HIGH" || sectorRisk === "CRITICAL") return "VOLATILE";
  if (sectorRisk === "MEDIUM") return "VARIABLE";
  return "STABLE";
}

/** Record completeness, used as the governance proxy and shown in the UI. */
function governanceScoreFor(client) {
  const fields = client ? [client.phone, client.branchId, client.officerId, client.notes] : [];
  return fields.filter((value) => String(value || "").trim().length > 0).length * 25;
}

/**
 * Sovereign risk code for the engine. Falls back to the institution's own
 * country. Unknown codes are rejected rather than passed through, because the
 * engine would look them up in its country map and yield NaN.
 */
function countryRiskFor(client) {
  const code = String((client && client.countryRisk) || "").trim().toUpperCase();
  return SUPPORTED_COUNTRY_RISKS.has(code) ? code : "CI";
}

function getClientScores() {
  return state.clients.map((client) => scoreClient(client.id)).sort((a, b) => a.score - b.score);
}

function averageScore() {
  const scores = getClientScores();
  return scores.length ? sum(scores.map((item) => item.score)) / scores.length : 0;
}

function scoreClient(clientId) {
  const client = getClient(clientId);
  const loans = state.loans.filter((loan) => loan.clientId === clientId);
  const savingsBalance = 0;

  const principal = sum(loans.map((loan) => loan.principal || 0));
  const outstanding = sum(loans.map((loan) => loan.outstanding || 0));
  const guarantee = sum(loans.map((loan) => loan.guarantee || 0));
  const monthlyIncome = Number(client && client.monthlyIncome) || 0;
  const monthlyDebtService = clientMonthlyDebtService(loans);
  const maxDpd = loans.reduce((worst, loan) => Math.max(worst, loanDaysPastDue(loan)), 0);
  const repaymentCount = state.repayments.filter((repayment) =>
    loans.some((loan) => loan.id === repayment.loanId)).length;

  // Every factor is derived from recorded data and surfaced in the UI, so a
  // credit officer can see what drove the score.
  const factors = {
    // Scaled against the 90-day PAR90 write-off threshold: 0 days late scores
    // 100, 45 days scores 50, and 90+ days scores 0 - which trips the engine's
    // "payment history below minimum" veto.
    //
    // The previous form, 100 - Math.min(90, maxDpd), floored this at EXACTLY 10
    // while the veto fires below 10, so it could never trigger: a borrower 200
    // days past due was scored 52,44 and graded BB instead of being refused.
    paymentHistory: Math.max(0, Math.min(100, 100 - Math.round((maxDpd * 100) / 90))),
    // AfriCredit debtRatio is a DEBT-SERVICE ratio: the share of monthly income
    // committed to repayment, which is what its >80 veto refuses. It is NOT loan
    // utilisation (outstanding / principal) - that reads 100 % on disbursement
    // day and 0 % at maturity, so using it vetoed every new borrower and
    // flattered every nearly-repaid one.
    debtRatio: monthlyIncome > 0
      ? Math.max(0, Math.min(100, (monthlyDebtService / monthlyIncome) * 100))
      : 0,
    sectorRisk: sectorRiskFor(client),
    governanceScore: governanceScoreFor(client),
    collateralValue: guarantee,
    cashFlowStability: cashFlowStabilityFor(client, maxDpd),
    // Collateral is judged as COVERAGE of the amount lent, not in absolute
    // francs. The engine's default anchor of 50 000 000 XOF is corporate-scale:
    // against it a 450 000 XOF guarantee scores 0,9/100, so the factor's whole
    // 10 % weight was inert and no client could be distinguished by their
    // guarantee. Anchoring on the principal makes the factor read "how much of
    // the loan is secured".
    collateralFullScoreXof: principal > 0 ? principal : undefined,
    // Read from the record rather than hardcoded: with a fixed "CI" the engine's
    // military-transition veto (BF, ML, NE, GN) could never fire, which would
    // silently mis-rate any cross-border lending. Ivorian is the default because
    // this institution is Ivorian, not because the field cannot vary.
    countryRisk: countryRiskFor(client)
  };

  // Income drives the debt-service ratio. Without it the engine would read a
  // ratio of 0 % - the most creditworthy value there is - so refuse to score.
  if (loans.length > 0 && !(monthlyIncome > 0)) {
    return {
      client,
      score: 0,
      grade: "N/A",
      status: "INCOMPLET",
      levelLabel: "Revenu non renseigne",
      levelClass: "negative",
      pillClass: "score-low",
      reason: "Revenu mensuel absent de la fiche client : la charge de la dette ne peut pas etre rapportee aux ressources, donc aucun score n'est calcule.",
      savingsBalance,
      factors,
      maxDpd,
      repaymentCount,
      monthlyIncome,
      monthlyDebtService,
      collateralCoverage: principal > 0 ? (guarantee / principal) * 100 : null,
      engine: "africredit"
    };
  }

  // Collateral is a required engine input. Rather than invent one, say so.
  if (!(guarantee > 0)) {
    return {
      client,
      score: 0,
      grade: "N/A",
      status: "INCOMPLET",
      levelLabel: "Garantie non renseignée",
      levelClass: "negative",
      pillClass: "score-low",
      reason: "Aucune garantie enregistrée sur les crédits de ce client : le score AfriCredit ne peut pas être calculé.",
      savingsBalance,
      factors,
      maxDpd,
      repaymentCount,
      monthlyIncome,
      monthlyDebtService,
      collateralCoverage: principal > 0 ? (guarantee / principal) * 100 : null,
      engine: "africredit"
    };
  }

  const assessment = calculateCreditScore(factors);
  const score = assessment.score;

  let levelLabel = "Sain";
  let levelClass = "positive";
  let pillClass = "score-good";
  let reason = "Le comportement de remboursement reste satisfaisant.";

  if (assessment.status === "VETOED") {
    levelLabel = "Veto";
    levelClass = "negative";
    pillClass = "score-low";
    reason = "Veto AfriCredit : " + vetoReasonFr(assessment.vetoReason) + ".";
  } else if (score < 50) {
    levelLabel = "Alerte élevée";
    levelClass = "negative";
    pillClass = "score-low";
    reason = "Les retards ou la faiblesse du dossier imposent un suivi rapproché.";
  } else if (score < 75) {
    levelLabel = "À surveiller";
    levelClass = "warning";
    pillClass = "score-mid";
    reason = "Le dossier tient mais mérite un contrôle régulier.";
  }

  return {
    client,
    score,
    grade: assessment.grade,
    status: assessment.status,
    vetoReason: assessment.vetoReason,
    levelLabel,
    levelClass,
    pillClass,
    reason,
    savingsBalance,
    factors,
    maxDpd,
    repaymentCount,
    monthlyIncome,
    monthlyDebtService,
    collateralCoverage: principal > 0 ? (guarantee / principal) * 100 : null,
    engine: "africredit"
  };
}

function getClient(clientId) {
  return state.clients.find((client) => client.id === clientId);
}

function getBranch(branchId) {
  return state.branches.find((branch) => branch.id === branchId);
}

function getOfficer(officerId) {
  return state.officers.find((officer) => officer.id === officerId);
}

function nextId(prefix, items, base) {
  const max = items.reduce((highest, item) => {
    const value = Number(String(item.id).split("-")[1]);
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, base);
  return `${prefix}-${max + 1}`;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function money(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(value);
}

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function pct(value) {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)}%`;
}

function prettyDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function prettyDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getActiveViewKey() {
  return els.navItems.find((item) => item.classList.contains("active"))?.dataset.view || "overview";
}

function bindAi() {
  if (els.aiRefreshBtn) {
    els.aiRefreshBtn.addEventListener("click", () => {
      void requestSourceRefresh();
    });
  }

  if (!els.aiForm) return;

  els.aiForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const question = els.aiQuestion.value.trim();
    if (!question) return;

    addAiMessage("user", question);
    aiHistory.push({ role: "user", content: question });
    els.aiQuestion.value = "";
    setAiLoadingState(true);

    try {
      const response = await fetch(apiUrl("/api/ask"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: aiHistory,
          portfolioContext: buildPortfolioContext()
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "La requête IA a échoué.");
      }

      addAiMessage("assistant", payload.answer, payload.citations || []);
      aiHistory.push({ role: "assistant", content: payload.answer });
    } catch (error) {
      addAiMessage("assistant", error.message);
    } finally {
      setAiLoadingState(false);
    }
  });
}

function renderAiExamples() {
  if (!els.aiExamples) return;

  els.aiExamples.innerHTML = AI_EXAMPLES.map(
    (prompt) => `<button type="button" class="ghost-btn ai-chip" data-ai-prompt="${escapeHtml(prompt)}">${prompt}</button>`
  ).join("");

  els.aiExamples.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-prompt]");
    if (!button) return;
    els.aiQuestion.value = button.dataset.aiPrompt;
    els.aiQuestion.focus();
  });
}

async function loadAiSourceDetails(sourceOverride = null) {
  if (!els.aiSourceTitle) return;

  try {
    const source = sourceOverride || await fetchSourceDetails();
    const capturedAt = source.capturedAt ? prettyDateTime(source.capturedAt) : "-";
    const freshness = source.refreshInProgress
      ? "Actualisation"
      : typeof source.sourceAgeHours === "number"
        ? source.sourceAgeHours < 1
          ? "<1h"
          : `${Math.round(source.sourceAgeHours)}h`
        : "-";

    els.aiSourceTitle.textContent = source.sourceLabel;
    els.aiSourceDescription.textContent = source.sourceReady
      ? source.refreshInProgress
        ? `Les sources officielles sont en cours d'actualisation. La dernière base complète date du ${capturedAt} et couvre ${source.countryCount} pays africains avec ${source.documentCount} documents officiels.`
        : `Base réglementaire actualisée le ${capturedAt}. L'actualisation quotidienne reste active tant que le serveur CIREX fonctionne, et l'index en cours couvre ${source.countryCount} pays africains ainsi que ${source.documentCount} documents officiels.`
      : `La base réglementaire connectée n'est pas encore prête. ${source.sourceError || ""}`.trim();

    els.aiMetaPills.innerHTML = [
      createAiPill("Pays", String(source.countryCount || 0)),
      createAiPill("Sources", String(source.documentCount || 0)),
      createAiPill("Fraîcheur", freshness),
      createAiPill("Mode", source.aiEnabled ? "Claude actif" : "Sources seules"),
      createAiPill("Serveur", source.sourceReady ? "Connecté" : "En attente")
    ].join("");

    if (els.aiRefreshBtn) {
      els.aiRefreshBtn.disabled = Boolean(source.refreshInProgress);
      els.aiRefreshBtn.textContent = source.refreshInProgress ? "Actualisation..." : "Actualiser les sources";
    }

    els.aiSourceLinks.innerHTML = (source.keySources || [])
      .map(
        (item) => `
          <a class="signal-row advisor-link" href="${item.url}" target="_blank" rel="noreferrer">
            <span>${item.label}</span>
            <strong>Ouvrir</strong>
          </a>
        `
      )
      .join("");

    if (source.refreshInProgress) {
      window.setTimeout(() => {
        void loadAiSourceDetails();
      }, 5000);
    }
  } catch (error) {
    els.aiSourceTitle.textContent = "Serveur IA CIREX non connecté";
    els.aiSourceDescription.textContent =
      window.location.protocol === "file:"
        ? "Lancez `npm run dev` dans le dossier microfinance-app, puis rouvrez ce fichier ou utilisez http://localhost:3100."
        : "Lancez `npm run dev` dans le dossier microfinance-app pour activer le conseiller IA.";
    els.aiMetaPills.innerHTML = [
      createAiPill("Serveur", "Hors ligne"),
      createAiPill("Astuce", "Lancer npm run dev")
    ].join("");
    els.aiSourceLinks.innerHTML = "";
    if (els.aiRefreshBtn) {
      els.aiRefreshBtn.disabled = false;
      els.aiRefreshBtn.textContent = "Actualiser les sources";
    }
  }
}

async function fetchSourceDetails() {
  const response = await fetch(apiUrl("/api/source"));
  if (!response.ok) {
    throw new Error("Le serveur IA de CIREX est inaccessible.");
  }

  return response.json();
}

async function requestSourceRefresh() {
  if (!els.aiRefreshBtn) return;

  els.aiRefreshBtn.disabled = true;
  els.aiRefreshBtn.textContent = "Actualisation...";

  try {
    const response = await fetch(apiUrl("/api/source/refresh"), {
      method: "POST"
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "L'actualisation des sources a échoué.");
    }

    await loadAiSourceDetails(payload);
  } catch (error) {
    els.aiSourceDescription.textContent = error.message;
    els.aiRefreshBtn.disabled = false;
    els.aiRefreshBtn.textContent = "Actualiser les sources";
  }
}

function startSourceStatusPolling() {
  window.setInterval(() => {
    void loadAiSourceDetails();
  }, SOURCE_STATUS_POLL_MS);
}

function createAiPill(label, value) {
  return `<span class="pill ai-meta-pill"><span>${label}</span><strong>${value}</strong></span>`;
}

function translateCitationSection(section) {
  return String(section || "Source")
    .replace("Country profile", "Profil pays")
    .replace("Publication page", "Page de publication")
    .replace("Regulatory index", "Index réglementaire")
    .replace("Official page", "Page officielle")
    .replace("PDF source", "Source PDF")
    .replace("Africa overview", "Vue Afrique")
    .replace("Western Africa", "Afrique de l'Ouest")
    .replace("Eastern Africa", "Afrique de l'Est")
    .replace("Central Africa", "Afrique centrale")
    .replace("Northern Africa", "Afrique du Nord")
    .replace("Southern Africa", "Afrique australe");
}

function addAiMessage(role, content, citations = []) {
  if (!els.aiChatLog) return;

  const article = document.createElement("article");
  article.className = `advisor-message ${role}`;

  const label = document.createElement("div");
  label.className = "eyebrow";
  label.textContent = role === "assistant" ? "Assistant" : "Vous";

  const body = document.createElement("div");
  body.className = "advisor-message-body";
  body.textContent = content;

  article.append(label, body);

  if (citations.length) {
    const citationsWrap = document.createElement("div");
    citationsWrap.className = "advisor-citations";

    citations.forEach((citation) => {
      const item = document.createElement("article");
      item.className = "stack-card advisor-citation";
      item.innerHTML = `
        <strong>Référence ${citation.id}</strong>
        <div>${escapeHtml(translateCitationSection(citation.section))}</div>
        ${
          citation.sourceUrl
            ? `<a class="compliance-link" href="${escapeHtml(citation.sourceUrl)}" target="_blank" rel="noreferrer">Ouvrir la source officielle</a>`
            : ""
        }
      `;
      citationsWrap.append(item);
    });

    article.append(citationsWrap);
  }

  els.aiChatLog.append(article);
  els.aiChatLog.scrollTop = els.aiChatLog.scrollHeight;
}

function setAiLoadingState(isLoading) {
  if (!els.aiSubmitBtn) return;
  els.aiSubmitBtn.disabled = isLoading;
  els.aiSubmitBtn.textContent = isLoading ? "Analyse..." : "Interroger l'IA";
}

function renderComplianceIdleStates() {
  renderComplianceIdleState(
    els.loanComplianceCard,
    `Chaque nouveau crédit est contrôlé avant enregistrement afin de limiter les écarts réglementaires et de respecter la politique interne CIREX. ${getInterestCeilingStatusText()}`
  );
  renderComplianceIdleState(
    els.repaymentComplianceCard,
    "Chaque remboursement est vérifié avant validation pour rester cohérent avec le dossier de crédit et le cadre légal."
  );
}

function renderComplianceIdleState(card, message) {
  if (!card) return;

  card.className = "compliance-card idle";
  card.innerHTML = `
    <div class="eyebrow">Filtre Juridique IA</div>
    <div class="compliance-body">${escapeHtml(message)}</div>
  `;
}

function renderComplianceLoadingState(card, message) {
  if (!card) return;

  card.className = "compliance-card loading";
  card.innerHTML = `
    <div class="compliance-header">
      <div class="eyebrow">Filtre Juridique IA</div>
      <span class="pill loading">Contrôle</span>
    </div>
    <div class="compliance-body">${escapeHtml(message)}</div>
  `;
}

function setActionButtonState(button, isLoading, idleLabel, loadingLabel) {
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingLabel : idleLabel;
}

function buildLoanDraft(form) {
  const clientId = String(form.get("clientId") || "");
  const branchId = String(form.get("branchId") || "");
  const officerId = String(form.get("officerId") || "");
  const client = getClient(clientId);
  const branch = getBranch(branchId);
  const officer = getOfficer(officerId);

  return {
    clientId,
    clientName: client?.name || "Client inconnu",
    clientSector: client?.sector || "",
    branchId,
    branchName: branch?.name || branchId,
    officerId,
    officerName: officer?.name || officerId,
    purpose: String(form.get("purpose") || "").trim(),
    principal: Number(form.get("principal")),
    guarantee: Number(form.get("guarantee") || 0),
    interestRate: Number(form.get("interestRate")),
    termMonths: Number(form.get("termMonths")),
    nextDueDate: String(form.get("nextDueDate") || ""),
    status: String(form.get("status") || ""),
    riskFlag: String(form.get("riskFlag") || "")
  };
}

function buildRepaymentDraft(form) {
  const loanId = String(form.get("loanId") || "");
  const loan = state.loans.find((entry) => entry.id === loanId);
  const client = loan ? getClient(loan.clientId) : null;
  const branch = loan ? getBranch(loan.branchId) : null;
  const officer = loan ? getOfficer(loan.officerId) : null;

  return {
    loanId,
    clientName: client?.name || "Client inconnu",
    branchName: branch?.name || "",
    officerName: officer?.name || "",
    loanStatusBeforePayment: loan?.status || "",
    loanOutstandingBeforePayment: Number(loan?.outstanding || 0),
    loanPrincipal: Number(loan?.principal || 0),
    amount: Number(form.get("amount")),
    paymentDate: String(form.get("paymentDate") || ""),
    note: String(form.get("note") || "").trim()
  };
}

async function runComplianceCheck({ operationType, operationData, button, idleLabel, loadingLabel, resultCard }) {
  const institutionCountry = state.metadata.institutionCountry || "Côte d’Ivoire";
  const operationLabel = operationType === "loan" ? "crédit" : "remboursement";
  const operationDataWithPolicy = {
    ...operationData,
    policyInterestCeiling: getCurrentInterestCeiling(),
    policyCustomerCount: state.clients.length,
    policyRuleSummary: describeInterestCeilingPolicy()
  };

  renderComplianceLoadingState(
    resultCard,
    `CIREX analyse ce ${operationLabel} au regard des sources juridiques indexées pour ${institutionCountry}.`
  );
  setActionButtonState(button, true, idleLabel, loadingLabel);

  try {
    const response = await fetch(apiUrl("/api/compliance/check"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationType,
        operationData: operationDataWithPolicy,
        institutionCountry,
        portfolioContext: buildPortfolioContext()
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Le contrôle de conformité a échoué.");
    }

    renderComplianceResult(resultCard, payload);
    return payload;
  } catch (error) {
    // The legal filter could not run (server unreachable, no AI credits, or a
    // malformed response). This block used to RENDER decision "REVIEW" but
    // return null, so the caller discarded the file: the officer lost the form
    // and no loan could ever be recorded when the service was down.
    //
    // A technical outage is not a refusal. Return a REVIEW verdict so the
    // operation flows into the human-review path that already exists — the
    // officer still has to check the sources and confirm, and the loan is
    // stamped so every file approved without the filter is auditable.
    const payload = {
      decision: "REVIEW",
      technicalFailure: true,
      summary: `Le filtre juridique IA n'a pas pu s'exécuter (${error.message}). Ce dossier n'a donc PAS été contrôlé automatiquement.`,
      risks: [
        "Aucun contrôle juridique automatique n'a été appliqué à cette opération.",
        "La responsabilité de la conformité repose entièrement sur la revue humaine ci-dessous."
      ],
      requiredActions: [
        "Vérifiez manuellement les sources officielles applicables (BCEAO, loi sur la microfinance, plafond de taux) avant d'enregistrer.",
        "Réessayez plus tard : le contrôle automatique reprendra dès que le serveur IA de CIREX sera accessible."
      ],
      scopeNote: `Pays de l'institution retenu pour ce contrôle : ${institutionCountry}.`,
      citations: []
    };
    renderComplianceResult(resultCard, payload);
    return payload;
  } finally {
    setActionButtonState(button, false, idleLabel, loadingLabel);
  }
}

function renderComplianceResult(card, payload) {
  if (!card) return;

  const decision = normalizeComplianceDecision(payload?.decision);
  const summary = String(payload?.summary || "").trim() || "Aucun résumé de conformité n'a été retourné.";
  const scopeNote = String(payload?.scopeNote || "").trim();
  const risks = Array.isArray(payload?.risks) ? payload.risks.filter(Boolean) : [];
  const requiredActions = Array.isArray(payload?.requiredActions) ? payload.requiredActions.filter(Boolean) : [];
  const citations = Array.isArray(payload?.citations) ? payload.citations : [];
  const checkedAt = payload?.checkedAt ? prettyDateTime(payload.checkedAt) : null;
  const sourceAge = typeof payload?.sourceAgeHours === "number"
    ? payload.sourceAgeHours < 1
      ? "<1h"
      : `${Math.round(payload.sourceAgeHours)}h`
    : null;

  card.className = `compliance-card ${decision.className}`;
  card.innerHTML = `
    <div class="compliance-header">
      <div class="eyebrow">Filtre Juridique IA</div>
      <span class="pill ${decision.pillClass}">${decision.label}</span>
    </div>
    <div class="compliance-body">${escapeHtml(summary)}</div>
    ${scopeNote ? `<div class="compliance-note">${escapeHtml(scopeNote)}</div>` : ""}
    ${renderComplianceLines("Points de vigilance", risks.length ? risks : [decision.defaultRisk])}
    ${renderComplianceLines("Actions à mener", requiredActions.length ? requiredActions : [decision.defaultAction])}
    ${renderComplianceActions(payload)}
    ${citations.length ? renderComplianceCitations(citations) : ""}
    <div class="muted">
      ${checkedAt ? `Contrôle effectué le ${checkedAt}.` : "Contrôle effectué à l'instant."}
      ${sourceAge ? ` Âge des sources juridiques : ${sourceAge}.` : ""}
    </div>
  `;
}

function renderComplianceActions(payload) {
  if (!payload?.manualReviewAllowed) {
    return "";
  }

  return `
    <div class="compliance-actions">
      <button class="secondary-btn" type="button" data-manual-approve="true">
        ${escapeHtml(payload.manualReviewLabel || "Valider le prêt après revue manuelle")}
      </button>
    </div>
  `;
}

function renderComplianceLines(title, items) {
  return `
    <div class="compliance-lines">
      <div class="compliance-line">
        <strong>${escapeHtml(title)}</strong>
        ${items
          .map((item) => `<p>${escapeHtml(item)}</p>`)
          .join("")}
      </div>
    </div>
  `;
}

function renderComplianceCitations(citations) {
  return `
    <div class="compliance-citations">
      ${citations
        .map(
          (citation) => `
            <div class="compliance-citation">
              <strong>Référence ${escapeHtml(citation.id)}</strong>
              <p>${escapeHtml(translateCitationSection(citation.section || "Source"))}</p>
              ${
                citation.sourceUrl
                  ? `<a class="compliance-link" href="${escapeHtml(citation.sourceUrl)}" target="_blank" rel="noreferrer">Ouvrir la source</a>`
                  : ""
              }
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function normalizeComplianceDecision(value) {
  switch (String(value || "").toUpperCase()) {
    case "APPROVED":
      return {
        label: "Approuvé",
        className: "approved",
        pillClass: "approved",
        defaultRisk: "Aucun conflit évident n'a été détecté dans le contexte officiel fourni.",
        defaultAction: "Poursuivez le circuit interne habituel et conservez la référence de source avec le dossier."
      };
    case "BLOCK":
      return {
        label: "Bloqué",
        className: "block",
        pillClass: "block",
        defaultRisk: "Le contexte fourni indique que cette opération ne doit pas être validée en l'état.",
        defaultAction: "N'enregistrez pas la transaction tant que le point bloquant n'a pas été corrigé et revu."
      };
    default:
      return {
        label: "À revoir",
        className: "review",
        pillClass: "review",
        defaultRisk: "La couverture juridique ou les faits de l'opération ne sont pas assez complets pour une validation automatique.",
        defaultAction: "Mettez l'opération en attente et demandez une confirmation humaine côté conformité."
      };
  }
}

function buildPortfolioContext() {
  const outstanding = sum(state.loans.map((loan) => loan.outstanding));
  const lateLoans = state.loans
    .filter((loan) => loan.status === "Late")
    .sort((left, right) => right.outstanding - left.outstanding);
  const watchLoans = state.loans
    .filter((loan) => loan.status === "Watch")
    .sort((left, right) => right.outstanding - left.outstanding);
  const currentInterestCeiling = getCurrentInterestCeiling();
  const nextInterestCeilingStage = getNextInterestCeilingStage();
  const branchExposure = getBranchMetrics()
    .slice(0, 3)
    .map((item) => `${item.branch.name}: ${Math.round(item.outstanding)} XOF d'encours, ${item.lateLoans} dossiers en retard`)
    .join("; ");
  const priorityLoans = [...lateLoans, ...watchLoans]
    .slice(0, 4)
    .map((loan) => {
      const client = getClient(loan.clientId);
      const branch = getBranch(loan.branchId);
      const officer = getOfficer(loan.officerId);
      return `${loan.id} | ${client?.name || "Client inconnu"} | ${getStatusLabel(loan.status)} | risque ${getRiskLabel(loan.riskFlag).toLowerCase()} | ${Math.round(loan.outstanding)} XOF d'encours | agence ${branch?.name || "-"} | agent ${officer?.name || "-"}`;
    })
    .join("; ");

  return [
    "Ceci est un instantané local du portefeuille CIREX, et non une source réglementaire officielle.",
    `Institution : ${state.metadata.institutionName}`,
    `Pays de l'institution : ${state.metadata.institutionCountry || "-"}`,
    `Cadre juridique régional : ${state.metadata.legalRegion || "-"}`,
    `Devise : ${state.metadata.baseCurrency}`,
    `Date de l'instantané : ${state.metadata.lastUpdated}`,
    `Agences : ${state.branches.length}; Agents : ${state.officers.length}; Clients : ${state.clients.length}; Crédits : ${state.loans.length}; Remboursements : ${state.repayments.length}`,
    `Politique interne de taux : ${describeInterestCeilingPolicy()}`,
    `Plafond interne actuellement applicable : ${currentInterestCeiling}%`,
    `Prochain palier interne : ${nextInterestCeilingStage ? `${nextInterestCeilingStage.ceiling}% à ${formatCount(nextInterestCeilingStage.minimumClients)} clients` : "Palier final déjà acquis"}`,
    `Encours total : ${Math.round(outstanding)} XOF`,
    `Dossiers en retard : ${lateLoans.length}`,
    `Dossiers sous surveillance : ${watchLoans.length}`,
    `Dossiers prioritaires : ${priorityLoans || "Aucun"}`,
    `Agence la plus exposée : ${branchExposure || "Aucune donnée agence"}`,
    `Score moyen client : ${averageScore().toFixed(0)} / 100`
  ].join("\n");
}

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

/**
 * Transient confirmation for the officer.
 *
 * The console had no notification element at all, so the approval path called a
 * showToast() that did not exist and threw a ReferenceError after doing its
 * work. Uses textContent, never innerHTML: the message carries an applicant's
 * name straight from their submission.
 */
let consoleToastTimer = null;
function showToast(message) {
  let host = document.getElementById("console-toast");
  if (!host) {
    host = document.createElement("div");
    host.id = "console-toast";
    host.className = "console-toast";
    document.body.appendChild(host);
  }
  host.textContent = String(message);
  host.classList.add("show");
  if (consoleToastTimer) clearTimeout(consoleToastTimer);
  consoleToastTimer = setTimeout(() => host.classList.remove("show"), 5200);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "cirex-microfinance-portefeuille.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function printClientStatement(clientId) {
  const client = getClient(clientId);
  if (!client) return;
  const loans = state.loans.filter((loan) => loan.clientId === clientId);
  const repayments = state.repayments.filter((entry) => loans.some((loan) => loan.id === entry.loanId));
  const score = scoreClient(clientId);
  const html = `
    <html><head><title>Fiche client</title><style>
      body{font-family:Arial,sans-serif;padding:32px;color:#201811}
      .card{border:1px solid #d8c7a7;border-radius:12px;padding:14px;margin:12px 0}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border-bottom:1px solid #eee2cb;padding:10px 8px;text-align:left}
      .muted{color:#6c6255}
    </style></head><body>
      <h1>${state.metadata.institutionName}</h1>
      <div class="muted">Fiche générée le ${new Date().toLocaleDateString("fr-FR")}</div>
      <div class="card"><strong>${escapeHtml(client.name)}</strong><div>${escapeHtml(client.sector)} | ${escapeHtml(client.region)}</div><div>${escapeHtml(getBranch(client.branchId)?.name || "")} | ${escapeHtml(getOfficer(client.officerId)?.name || "")}</div><div>Score ${score.score} / 100</div></div>
      <h2>Crédits</h2>
      <table><thead><tr><th>ID</th><th>Objet</th><th>Statut</th><th>Encours</th></tr></thead><tbody>
      ${loans.map((loan) => `<tr><td>${escapeHtml(loan.id)}</td><td>${escapeHtml(loan.purpose)}</td><td>${getStatusLabel(loan.status)}</td><td>${money(loan.outstanding)}</td></tr>`).join("") || `<tr><td colspan="4">Aucun crédit</td></tr>`}
      </tbody></table>
      <h2>Remboursements récents</h2>
      <table><thead><tr><th>Date</th><th>Crédit</th><th>Montant</th><th>Note</th></tr></thead><tbody>
      ${repayments.map((entry) => `<tr><td>${prettyDate(entry.paymentDate)}</td><td>${entry.loanId}</td><td>${money(entry.amount)}</td><td>${entry.note}</td></tr>`).join("") || `<tr><td colspan="4">Aucun remboursement</td></tr>`}
      </tbody></table>
    </body></html>`;
  openPrintWindow(html);
}

function printRepaymentReceipt(repaymentId) {
  const repayment = state.repayments.find((entry) => entry.id === repaymentId);
  if (!repayment) return;
  const loan = state.loans.find((entry) => entry.id === repayment.loanId);
  const client = loan ? getClient(loan.clientId) : null;
  const html = `
    <html><head><title>Reçu de remboursement</title><style>
      body{font-family:Arial,sans-serif;padding:32px;color:#201811}
      .receipt{border:2px solid #d8c7a7;border-radius:16px;padding:24px;max-width:700px}
      .row{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #eee2cb}
    </style></head><body>
      <div class="receipt">
        <h1>${state.metadata.institutionName}</h1>
        <div class="row"><strong>ID reçu</strong><span>${repayment.id}</span></div>
        <div class="row"><strong>Client</strong><span>${client?.name || "Inconnu"}</span></div>
        <div class="row"><strong>ID crédit</strong><span>${repayment.loanId}</span></div>
        <div class="row"><strong>Date de paiement</strong><span>${prettyDate(repayment.paymentDate)}</span></div>
        <div class="row"><strong>Montant</strong><span>${money(repayment.amount)}</span></div>
        <div class="row"><strong>Note</strong><span>${repayment.note}</span></div>
      </div>
    </body></html>`;
  openPrintWindow(html);
}

function openPrintWindow(html) {
  const printWindow = window.open("", "_blank", "width=960,height=720");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
