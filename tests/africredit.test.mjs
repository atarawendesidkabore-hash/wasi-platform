/**
 * AfriCredit tests — harvested from the React app's Jest suites and ported to
 * node:test so they run with `node --test` and no dependencies.
 *
 * Beyond the original assertions, these pin the EXACT scores. The React
 * version used decimal.js for rounding and the platform cannot ship a
 * dependency, so exact expected values are what prove the substitute
 * arithmetic behaves identically.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { round2, WEIGHTS } from "../lib/africredit/constants.js";
import { calculateCreditScore, mapScoreToGrade } from "../lib/africredit/credit-scoring.js";
import {
  calculateOSS,
  calculatePAR,
  generatePortfolioSummary,
  identifyAtRiskLoans,
} from "../lib/africredit/par-calculator.js";
import {
  DECISION_COMPONENT_WEIGHTS,
  WASIExpertScoringEngine,
} from "../lib/africredit/expert-scoring-engine.js";
import { buildSchedule } from "../lib/africredit/amortisation.js";

const baseInput = {
  paymentHistory: 82,
  debtRatio: 35,
  sectorRisk: "MEDIUM",
  governanceScore: 78,
  collateralValue: 22_000_000,
  cashFlowStability: "STABLE",
  countryRisk: "SN",
};

// ── Weight integrity ───────────────────────────────────────────────────────
test("credit score weights sum to exactly 1", () => {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(round2(total), 1);
});

test("decision component weights sum to exactly 1", () => {
  const total = Object.values(DECISION_COMPONENT_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(round2(total), 1);
});

// ── round2: the decimal.js replacement ─────────────────────────────────────
test("round2 reproduces decimal.js ROUND_HALF_UP", () => {
  // decimal.js builds from the number's shortest round-trip string, then
  // rounds half-up. So a literal .xx5 rounds UP, even though the stored double
  // is a hair below it — Math.round(1.005 * 100) would give 1.00.
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(28.885), 28.89);
  assert.equal(round2(-1.005), -1.01);

  // Values below the half round down.
  assert.equal(round2(28.8849), 28.88);
  assert.equal(round2(1.0049), 1.0);

  // A value whose SHORTEST representation is itself below the half rounds
  // down. This is the case that must not be "cleaned up": treating it as
  // 28.885 made every affected credit score a cent higher than the React app.
  assert.equal(round2(28.884999999999998), 28.88);

  // Values already at or below 2 decimals pass through untouched.
  assert.equal(round2(74.85), 74.85);
  assert.equal(round2(60), 60);
});

// ── calculateCreditScore ───────────────────────────────────────────────────
test("returns approved score and grade when no veto applies", () => {
  const result = calculateCreditScore(baseInput);
  assert.equal(result.status, "APPROVED");
  assert.ok(result.score > 0);
  assert.match(result.grade, /^(AAA|AA|A|BBB|BB|B|CCC|D)$/);
});

test("scores the reference application at exactly 74.85 (grade A)", () => {
  // 82*.25 + 65*.20 + 75*.15 + 78*.15 + 44*.10 + 100*.10 + 80*.05
  const result = calculateCreditScore(baseInput);
  assert.equal(result.score, 74.85);
  assert.equal(result.grade, "A");
});

test("caps the collateral factor at 100", () => {
  const capped = calculateCreditScore({ ...baseInput, collateralValue: 500_000_000 });
  const atFull = calculateCreditScore({ ...baseInput, collateralValue: 50_000_000 });
  assert.equal(capped.score, atFull.score);
});

test("vetoes for military transition country", () => {
  const result = calculateCreditScore({ ...baseInput, countryRisk: "BF" });
  assert.equal(result.status, "VETOED");
  assert.equal(result.score, 0);
  assert.equal(result.grade, "D");
  assert.match(result.vetoReason, /military transition/);
});

test("vetoes for debt ratio above 80%", () => {
  const result = calculateCreditScore({ ...baseInput, debtRatio: 81 });
  assert.equal(result.status, "VETOED");
  assert.match(result.vetoReason, /Debt ratio above 80%/);
});

test("vetoes for payment history below 10", () => {
  const result = calculateCreditScore({ ...baseInput, paymentHistory: 9 });
  assert.equal(result.status, "VETOED");
  assert.match(result.vetoReason, /Payment history/);
});

test("vetoes for volatile cash flow with debt ratio above 60%", () => {
  const result = calculateCreditScore({
    ...baseInput,
    cashFlowStability: "VOLATILE",
    debtRatio: 61,
  });
  assert.equal(result.status, "VETOED");
  assert.match(result.vetoReason, /Volatile cash flow/);
});

// ── What debtRatio actually means ──────────────────────────────────────────
// Regression guard. The microfinance app first fed this input loan utilisation
// (outstanding / principal), which reads 100 % the day a loan is disbursed and
// 0 % at maturity. Every new borrower was therefore vetoed on "debt ratio above
// 80%" while a nearly-repaid one scored as pristine — the metric inverted.
// debtRatio is a DEBT-SERVICE ratio: monthly instalment ÷ monthly income.
test("debtRatio is debt service over income, not loan utilisation", () => {
  // A borrower who took 850 000 XOF over 8 months at 5,5 % yesterday. The whole
  // principal is still outstanding, so utilisation is 100 %.
  const schedule = buildSchedule({
    principalCentimes: 850_000n * 100n,
    annualRatePct: 5.5,
    termMonths: 8,
    firstDueDate: "2026-09-01",
  });
  const monthlyInstalment = Number(schedule.instalments[0].totalDueCentimes / 100n);
  const monthlyIncome = 340_000;
  const debtService = (monthlyInstalment / monthlyIncome) * 100;

  assert.ok(debtService < 80, `debt service ${debtService} should be affordable`);

  // Fed the service ratio, the engine scores the loan.
  const scored = calculateCreditScore({ ...baseInput, debtRatio: debtService });
  assert.equal(scored.status, "APPROVED");
  assert.ok(scored.score > 0);

  // Fed utilisation instead, the same sound borrower is refused outright. This
  // is the defect the assertion above exists to prevent.
  const utilisation = calculateCreditScore({ ...baseInput, debtRatio: 100 });
  assert.equal(utilisation.status, "VETOED");
});

// ── Collateral anchor ──────────────────────────────────────────────────────
// The 50 000 000 XOF default is corporate-scale. Microfinance guarantees are
// 75 000 - 450 000 XOF, which scored 0,15-0,9 out of 100 and made the factor's
// entire 10 % weight inert: no client could be told apart by their guarantee.
test("collateral anchor defaults to 50M and is overridable", () => {
  const guarantee = 450_000;

  // Default: a village guarantee is worth 0,9/100 on the factor.
  const corporate = calculateCreditScore({ ...baseInput, collateralValue: guarantee });
  const tiny = calculateCreditScore({ ...baseInput, collateralValue: 75_000 });
  assert.ok(Math.abs(corporate.score - tiny.score) < 0.1,
    "with the corporate anchor a 6x bigger guarantee barely moves the score");

  // Anchored on the principal, the factor becomes a coverage ratio: 450 000 of
  // 900 000 lent is 50 % coverage, worth 5 of the 10 available points.
  const covered = calculateCreditScore({
    ...baseInput, collateralValue: guarantee, collateralFullScoreXof: 900_000 });
  assert.ok(covered.score - corporate.score > 4.5,
    `coverage anchoring should add ~5 points, added ${covered.score - corporate.score}`);

  // Coverage above 100 % is capped, never rewarded beyond full security.
  const over = calculateCreditScore({
    ...baseInput, collateralValue: 2_000_000, collateralFullScoreXof: 900_000 });
  const exact = calculateCreditScore({
    ...baseInput, collateralValue: 900_000, collateralFullScoreXof: 900_000 });
  assert.equal(over.score, exact.score);

  // A zero or absent anchor must fall back to the default, not divide by zero.
  const fallback = calculateCreditScore({
    ...baseInput, collateralValue: guarantee, collateralFullScoreXof: 0 });
  assert.equal(fallback.score, corporate.score);
});

// Severe arrears must be able to reach this veto. The microfinance app used to
// clamp its payment-history input at exactly 10 while the veto fires below 10,
// so a borrower 200 days past due scored 52,44 and was graded BB.
test("payment history of 0 vetoes, and 90-day arrears can reach it", () => {
  const writeOff = calculateCreditScore({ ...baseInput, paymentHistory: 0 });
  assert.equal(writeOff.status, "VETOED");
  assert.match(writeOff.vetoReason, /Payment history/);

  // The app scales days past due against the 90-day PAR90 threshold.
  const scale = (dpd) => Math.max(0, Math.min(100, 100 - Math.round((dpd * 100) / 90)));
  assert.equal(scale(0), 100);
  assert.equal(scale(45), 50);
  assert.equal(scale(90), 0);
  assert.equal(scale(200), 0);
  assert.equal(calculateCreditScore({ ...baseInput, paymentHistory: scale(90) }).status, "VETOED");
  assert.equal(calculateCreditScore({ ...baseInput, paymentHistory: scale(200) }).status, "VETOED");
});

test("rejects out-of-range and non-positive inputs", () => {
  assert.throws(() => calculateCreditScore({ ...baseInput, paymentHistory: 101 }), /paymentHistory/);
  assert.throws(() => calculateCreditScore({ ...baseInput, debtRatio: -1 }), /debtRatio/);
  assert.throws(() => calculateCreditScore({ ...baseInput, governanceScore: NaN }), /governanceScore/);
  assert.throws(() => calculateCreditScore({ ...baseInput, collateralValue: 0 }), /greater than 0/);
});

test("maps score boundaries to grades", () => {
  assert.equal(mapScoreToGrade(90), "AAA");
  assert.equal(mapScoreToGrade(89.99), "AA");
  assert.equal(mapScoreToGrade(70), "A");
  assert.equal(mapScoreToGrade(29.99), "D");
});

// ── PAR / OSS ──────────────────────────────────────────────────────────────
const loans = [
  { id: "L1", disbursedAmount: 1_000_000n, outstandingBalance: 900_000n, daysPastDue: 0, status: "ACTIVE" },
  { id: "L2", disbursedAmount: 800_000n, outstandingBalance: 700_000n, daysPastDue: 32, status: "ACTIVE" },
  { id: "L3", disbursedAmount: 500_000n, outstandingBalance: 400_000n, daysPastDue: 64, status: "DEFAULTED" },
  { id: "L4", disbursedAmount: 300_000n, outstandingBalance: 250_000n, daysPastDue: 95, status: "ACTIVE" },
  { id: "L5", disbursedAmount: 300_000n, outstandingBalance: 0n, daysPastDue: 0, status: "REPAID" },
];

test("calculates PAR30, PAR60, PAR90", () => {
  assert.equal(calculatePAR(loans, 30), 60);
  assert.equal(calculatePAR(loans, 60), 28.89);
  assert.equal(calculatePAR(loans, 90), 11.11);
});

test("PAR is 0 on an empty or fully repaid portfolio", () => {
  assert.equal(calculatePAR([], 30), 0);
  assert.equal(calculatePAR([loans[4]], 30), 0);
});

test("identifies at-risk loans with threshold", () => {
  assert.deepEqual(identifyAtRiskLoans(loans, 60).map((l) => l.id), ["L3", "L4"]);
});

test("rejects a non-positive threshold", () => {
  assert.throws(() => identifyAtRiskLoans(loans, 0), /positive integer/);
  assert.throws(() => identifyAtRiskLoans(loans, 1.5), /positive integer/);
});

test("calculates OSS", () => {
  assert.equal(calculateOSS(1_500_000n, 900_000n, 300_000n), 125);
});

test("rejects invalid OSS inputs", () => {
  assert.throws(() => calculateOSS(0n, 900_000n, 300_000n), /financialIncome/);
  assert.throws(() => calculateOSS(1_500_000n, -1n, 0n), /non-negative/);
  assert.throws(() => calculateOSS(1_500_000n, 0n, 0n), /greater than 0/);
});

test("generates portfolio summary", () => {
  const summary = generatePortfolioSummary(loans);
  assert.equal(summary.totalLoans, 5);
  assert.equal(summary.activeExposureCentimes, 2_250_000n);
  assert.equal(summary.atRisk30Centimes, 1_350_000n);
  assert.equal(summary.par30, 60);
  assert.equal(summary.par60, 28.89);
  assert.equal(summary.par90, 11.11);
});

// ── Expert decision engine ─────────────────────────────────────────────────
const engine = new WASIExpertScoringEngine();
const strong = { pays: 80, politique: 75, sectoriel: 78, flux: 82, corridor: 70, emprunteur: 76, change: 72 };

test("proposes APPROVE on a strong file and always demands human review", () => {
  // 80*.20 + 75*.15 + 78*.15 + 82*.15 + 70*.10 + 76*.15 + 72*.10 = 76.85
  const r = engine.evaluateDecision({ country: "SN", loanType: "projet", components: strong });
  assert.equal(r.decision_proposal, "APPROVE");
  assert.equal(r.score, 76.85);
  assert.equal(r.veto_applied, false);
  assert.equal(r.human_review_required, true);
  assert.match(r.disclaimer, /validation humaine/);
});

test("proposes REVIEW then REJECT as the file weakens", () => {
  const mid = engine.evaluateDecision({
    country: "SN", loanType: "projet",
    components: { pays: 60, politique: 60, sectoriel: 60, flux: 60, corridor: 60, emprunteur: 60, change: 60 },
  });
  assert.equal(mid.score, 60);
  assert.equal(mid.decision_proposal, "REVIEW");

  const weak = engine.evaluateDecision({
    country: "SN", loanType: "projet",
    components: { pays: 40, politique: 40, sectoriel: 40, flux: 40, corridor: 40, emprunteur: 40, change: 40 },
  });
  assert.equal(weak.decision_proposal, "REJECT");
});

test("vetoes sovereign debt for BF/ML/NE/GN", () => {
  for (const country of ["BF", "ML", "NE", "GN"]) {
    const r = engine.evaluateDecision({ country, loanType: "dette_souveraine", components: strong });
    assert.equal(r.decision_proposal, "VETOED");
    assert.equal(r.veto_applied, true);
    assert.equal(r.score, 0);
    assert.match(r.veto_reason, /dette_souveraine blocked/);
  }
});

test("does not veto other loan types in those countries", () => {
  const r = engine.evaluateDecision({ country: "BF", loanType: "microfinance", components: strong });
  assert.equal(r.veto_applied, false);
  assert.equal(r.decision_proposal, "APPROVE");
});

test("rejects out-of-range components", () => {
  assert.throws(
    () => engine.evaluateDecision({ country: "SN", loanType: "projet", components: { ...strong, flux: 101 } }),
    /components.flux/
  );
});
