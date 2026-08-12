/**
 * AfriCredit — shared constants.
 *
 * Harvested from the WASI React app (src/africredit/constants.ts). Kept as
 * plain ESM: the platform has no build step, so nothing here may require
 * transpiling or an npm dependency.
 */

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;
export const MAX_SAFE_MONEY_XOF = Number.MAX_SAFE_INTEGER;

/** Credit-score factor weights. Must sum to 1. */
export const WEIGHTS = Object.freeze({
  paymentHistory: 0.25,
  debtRatio: 0.2,
  sectorRisk: 0.15,
  governanceScore: 0.15,
  collateralValue: 0.1,
  cashFlowStability: 0.1,
  countryRisk: 0.05,
});

/** Collateral value that earns a full 100 on the collateral factor. */
export const COLLATERAL_FULL_SCORE_XOF = 50_000_000;

/** Countries under military transition — an automatic veto on lending. */
export const MILITARY_TRANSITION_COUNTRIES = new Set(["BF", "ML", "NE", "GN"]);

/** Sovereign-debt exposure is refused for the same set. */
export const SOVEREIGN_DEBT_VETO_COUNTRIES = new Set(["BF", "ML", "NE", "GN"]);

export const CREDIT_DECISION_DISCLAIMER =
  "Advisory only. Décision finale = validation humaine";

/**
 * Rounds to 2 decimals, half-up, reproducing decimal.js ROUND_HALF_UP exactly.
 *
 * The React original used decimal.js; the platform ships no dependencies, so
 * this is a faithful substitute rather than an improvement.
 *
 * The subtlety that matters: decimal.js rounds the value the double ACTUALLY
 * holds, not the decimal literal that was typed. 73.075 is stored as
 * 73.07499999999999289…, so decimal.js yields 73.07 — not 73.08. Rounding via
 * `Math.round(value * 100)` or after a `toPrecision` clean-up rounds UP
 * instead, which made every affected credit score one cent higher than the
 * React app's. So we read the exact decimal expansion with toFixed(20) and
 * decide on the third digit.
 *
 * An equivalence harness compares this against the decimal.js original across
 * thousands of inputs; the harvested tests pin the results in CI.
 *
 * @param {number} value
 * @returns {number}
 */
export function round2(value) {
  if (!Number.isFinite(value)) return value;

  const negative = value < 0;
  const text = String(Math.abs(value));
  if (text.includes("e")) return value; // out of our 0..100 domain; leave as is

  const [whole, fraction = ""] = text.split(".");
  if (fraction.length <= 2) return value; // already at or below 2 decimals

  let scaled = Number(whole + fraction.slice(0, 2));
  if (fraction.charCodeAt(2) - 48 >= 5) scaled += 1; // half-up on digit 3

  const rounded = scaled / 100;
  return negative ? -rounded : rounded;
}
