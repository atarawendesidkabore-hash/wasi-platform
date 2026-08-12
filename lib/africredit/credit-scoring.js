/**
 * AfriCredit — WASI credit score.
 *
 * Harvested from the WASI React app (src/africredit/creditScoring.ts).
 * Weighted multi-factor score with mandatory veto checks that run BEFORE any
 * scoring: a veto is a refusal, not a low score.
 *
 * @typedef {"LOW"|"MEDIUM"|"HIGH"|"CRITICAL"} SectorRisk
 * @typedef {"STABLE"|"VARIABLE"|"VOLATILE"} CashFlowStability
 * @typedef {"APPROVED"|"VETOED"} CreditStatus
 * @typedef {"AAA"|"AA"|"A"|"BBB"|"BB"|"B"|"CCC"|"D"} CreditGrade
 * @typedef {"BJ"|"BF"|"CV"|"CI"|"GM"|"GH"|"GN"|"GW"|"LR"|"ML"|"MR"|"NE"|"NG"|"SN"|"SL"|"TG"} EcowasCountryCode
 *
 * @typedef {Object} CreditApplicationInput
 * @property {number} paymentHistory   0–100
 * @property {number} debtRatio        0–100
 * @property {SectorRisk} sectorRisk
 * @property {number} governanceScore  0–100
 * @property {number} collateralValue  XOF, > 0
 * @property {CashFlowStability} cashFlowStability
 * @property {EcowasCountryCode} countryRisk
 *
 * @typedef {Object} CreditScoreResult
 * @property {number} score
 * @property {CreditGrade} grade
 * @property {CreditStatus} status
 * @property {string} [vetoReason]
 */

import {
  COLLATERAL_FULL_SCORE_XOF,
  MAX_SAFE_MONEY_XOF,
  MILITARY_TRANSITION_COUNTRIES,
  SCORE_MAX,
  SCORE_MIN,
  WEIGHTS,
  round2,
} from "./constants.js";

const sectorRiskScoreMap = { LOW: 100, MEDIUM: 75, HIGH: 45, CRITICAL: 15 };
const cashFlowScoreMap = { STABLE: 100, VARIABLE: 60, VOLATILE: 20 };

/** Sovereign risk contribution per ECOWAS country. */
const countryRiskScoreMap = {
  BJ: 72, BF: 35, CV: 76, CI: 78, GM: 58, GH: 70, GN: 48, GW: 50,
  LR: 53, ML: 40, MR: 55, NE: 38, NG: 67, SN: 80, SL: 56, TG: 73,
};

/**
 * Validates a percent-style input constrained to [0..100].
 * @param {number} value
 * @param {string} field
 */
export function validatePercentInput(value, field) {
  if (!Number.isFinite(value) || value < SCORE_MIN || value > SCORE_MAX) {
    throw new Error(`${field} must be between 0 and 100`);
  }
}

/**
 * Validates a collateral amount in XOF with safe-number boundaries.
 * @param {number} collateralValue
 */
export function validateCollateralValue(collateralValue) {
  if (!Number.isFinite(collateralValue) || collateralValue <= 0) {
    throw new Error("collateralValue must be greater than 0");
  }
  if (collateralValue > MAX_SAFE_MONEY_XOF) {
    throw new Error("collateralValue exceeds MAX_SAFE_INTEGER");
  }
}

/**
 * Calculates the WASI credit score with weighted factors and veto checks.
 * @param {CreditApplicationInput} input
 * @returns {CreditScoreResult}
 */
export function calculateCreditScore(input) {
  validatePercentInput(input.paymentHistory, "paymentHistory");
  validatePercentInput(input.debtRatio, "debtRatio");
  validatePercentInput(input.governanceScore, "governanceScore");
  validateCollateralValue(input.collateralValue);

  // Vetoes first: these are refusals on principle, so no score is produced.
  if (MILITARY_TRANSITION_COUNTRIES.has(input.countryRisk)) {
    return veto("Country under military transition");
  }
  if (input.debtRatio > 80) {
    return veto("Debt ratio above 80% threshold");
  }
  if (input.paymentHistory < 10) {
    return veto("Payment history below minimum threshold");
  }
  if (input.cashFlowStability === "VOLATILE" && input.debtRatio > 60) {
    return veto("Volatile cash flow combined with high debt ratio");
  }

  const debtScore = SCORE_MAX - input.debtRatio;
  // Multiply BEFORE dividing. The React original did this in decimal.js, which
  // is exact; dividing first in floating point gives 22M/50M*100 =
  // 44.000000000000006 instead of 44, which then shifts the rounded score by
  // a cent. Both operands are integers here, so this form stays exact.
  const collateralScore = Math.min(
    SCORE_MAX,
    (input.collateralValue * SCORE_MAX) / COLLATERAL_FULL_SCORE_XOF
  );

  const weighted =
    input.paymentHistory * WEIGHTS.paymentHistory +
    debtScore * WEIGHTS.debtRatio +
    sectorRiskScoreMap[input.sectorRisk] * WEIGHTS.sectorRisk +
    input.governanceScore * WEIGHTS.governanceScore +
    collateralScore * WEIGHTS.collateralValue +
    cashFlowScoreMap[input.cashFlowStability] * WEIGHTS.cashFlowStability +
    countryRiskScoreMap[input.countryRisk] * WEIGHTS.countryRisk;

  const score = round2(weighted);

  return { score, grade: mapScoreToGrade(score), status: "APPROVED" };
}

/**
 * Converts a numeric score to a rating grade.
 * @param {number} score
 * @returns {CreditGrade}
 */
export function mapScoreToGrade(score) {
  if (score >= 90) return "AAA";
  if (score >= 80) return "AA";
  if (score >= 70) return "A";
  if (score >= 60) return "BBB";
  if (score >= 50) return "BB";
  if (score >= 40) return "B";
  if (score >= 30) return "CCC";
  return "D";
}

/**
 * @param {string} reason
 * @returns {CreditScoreResult}
 */
function veto(reason) {
  return { score: 0, grade: "D", status: "VETOED", vetoReason: reason };
}
