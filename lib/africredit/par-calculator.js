/**
 * AfriCredit — Portfolio At Risk (PAR) and Operational Self-Sufficiency (OSS).
 *
 * Harvested from the WASI React app (src/africredit/parCalculator.ts).
 * These are the metrics the investor projections commit to (PAR30 < 5%), so
 * the arithmetic is pinned by tests.
 *
 * Money is bigint in centimes throughout — never a float. Ratios are computed
 * in bigint at four decimal places and only then converted, so the
 * decimal.js dependency the React version needed is not required here.
 *
 * @typedef {Object} Loan
 * @property {string} id
 * @property {bigint} disbursedAmount
 * @property {bigint} outstandingBalance
 * @property {number} daysPastDue
 * @property {"ACTIVE"|"DEFAULTED"|"REPAID"|"WRITTEN_OFF"} status
 *
 * @typedef {Object} PortfolioSummary
 * @property {number} totalLoans
 * @property {bigint} activeExposureCentimes
 * @property {bigint} atRisk30Centimes
 * @property {bigint} atRisk60Centimes
 * @property {bigint} atRisk90Centimes
 * @property {number} par30
 * @property {number} par60
 * @property {number} par90
 */

import { round2 } from "./constants.js";

/** Only live exposure counts: repaid and written-off loans are excluded. */
const isLive = (loan) => loan.status === "ACTIVE" || loan.status === "DEFAULTED";

const sumOutstanding = (loans) =>
  loans.reduce((sum, loan) => sum + loan.outstandingBalance, 0n);

/**
 * Ratio of two bigints as a percentage, rounded half-up to 2 decimals.
 * Scaling by 1e6 keeps four significant decimals before the float conversion.
 * @param {bigint} part
 * @param {bigint} whole
 * @returns {number}
 */
function percentOf(part, whole) {
  if (whole === 0n) return 0;
  const scaled = (part * 1_000_000n) / whole; // percent x 10^4, truncated
  return round2(Number(scaled) / 10_000);
}

/**
 * Portfolio At Risk as a percentage of live exposure.
 * @param {Loan[]} loans
 * @param {30|60|90} threshold
 * @returns {number}
 */
export function calculatePAR(loans, threshold) {
  const live = loans.filter(isLive);
  const exposure = sumOutstanding(live);
  if (exposure === 0n) return 0;
  const atRisk = sumOutstanding(live.filter((loan) => loan.daysPastDue >= threshold));
  return percentOf(atRisk, exposure);
}

/**
 * Operational Self-Sufficiency ratio, as a percentage.
 * @param {bigint} financialIncome
 * @param {bigint} operatingCosts
 * @param {bigint} provisionExpense
 * @returns {number}
 */
export function calculateOSS(financialIncome, operatingCosts, provisionExpense) {
  if (financialIncome <= 0n) {
    throw new Error("financialIncome must be greater than 0");
  }
  if (operatingCosts < 0n || provisionExpense < 0n) {
    throw new Error("operatingCosts and provisionExpense must be non-negative");
  }
  const denominator = operatingCosts + provisionExpense;
  if (denominator === 0n) {
    throw new Error("operatingCosts + provisionExpense must be greater than 0");
  }
  return percentOf(financialIncome, denominator);
}

/**
 * Loans whose days past due meets or exceeds the threshold.
 * @param {Loan[]} loans
 * @param {number} threshold
 * @returns {Loan[]}
 */
export function identifyAtRiskLoans(loans, threshold) {
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new Error("threshold must be a positive integer");
  }
  return loans.filter((loan) => isLive(loan) && loan.daysPastDue >= threshold);
}

/**
 * Full portfolio summary with PAR30/PAR60/PAR90.
 * @param {Loan[]} loans
 * @returns {PortfolioSummary}
 */
export function generatePortfolioSummary(loans) {
  return {
    totalLoans: loans.length,
    activeExposureCentimes: sumOutstanding(loans.filter(isLive)),
    atRisk30Centimes: sumOutstanding(identifyAtRiskLoans(loans, 30)),
    atRisk60Centimes: sumOutstanding(identifyAtRiskLoans(loans, 60)),
    atRisk90Centimes: sumOutstanding(identifyAtRiskLoans(loans, 90)),
    par30: calculatePAR(loans, 30),
    par60: calculatePAR(loans, 60),
    par90: calculatePAR(loans, 90),
  };
}
