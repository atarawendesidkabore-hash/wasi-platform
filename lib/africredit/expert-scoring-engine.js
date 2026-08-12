/**
 * AfriCredit — WASI expert decision engine.
 *
 * Harvested from the WASI React app (src/africredit/expertScoringEngine.ts).
 * Scores a lending decision across seven components and returns a PROPOSAL.
 * `human_review_required` is always true and the disclaimer always present:
 * the engine advises, it never decides.
 *
 * @typedef {"projet"|"trade_finance"|"dette_souveraine"|"private_equity"|"court_terme"|"credit_bail"|"microfinance"} WasiLoanType
 *
 * @typedef {Object} CreditEngineComponents
 * @property {number} pays        0–100
 * @property {number} politique   0–100
 * @property {number} sectoriel   0–100
 * @property {number} flux        0–100
 * @property {number} corridor    0–100
 * @property {number} emprunteur  0–100
 * @property {number} change      0–100
 *
 * @typedef {Object} CreditDecisionInput
 * @property {string} country ECOWAS ISO2
 * @property {WasiLoanType} loanType
 * @property {CreditEngineComponents} components
 * @property {string} [borrowerProfile]
 * @property {string} [corridor]
 *
 * @typedef {Object} CreditDecisionResult
 * @property {"APPROVE"|"REVIEW"|"REJECT"|"VETOED"} decision_proposal
 * @property {number} score
 * @property {boolean} veto_applied
 * @property {string} [veto_reason]
 * @property {true} human_review_required
 * @property {string} disclaimer
 */

import {
  CREDIT_DECISION_DISCLAIMER,
  SCORE_MAX,
  SCORE_MIN,
  SOVEREIGN_DEBT_VETO_COUNTRIES,
  round2,
} from "./constants.js";

/** Decision component weights. Must sum to 1. */
export const DECISION_COMPONENT_WEIGHTS = Object.freeze({
  pays: 0.2,
  politique: 0.15,
  sectoriel: 0.15,
  flux: 0.15,
  corridor: 0.1,
  emprunteur: 0.15,
  change: 0.1,
});

function validateComponent(value, label) {
  if (!Number.isFinite(value) || value < SCORE_MIN || value > SCORE_MAX) {
    throw new Error(`${label} must be between 0 and 100`);
  }
}

function computeDecisionProposal(score) {
  if (score >= 75) return "APPROVE";
  if (score >= 55) return "REVIEW";
  return "REJECT";
}

function veto(vetoReason) {
  return {
    decision_proposal: "VETOED",
    score: 0,
    veto_applied: true,
    veto_reason: vetoReason,
    human_review_required: true,
    disclaimer: CREDIT_DECISION_DISCLAIMER,
  };
}

export class WASIExpertScoringEngine {
  /**
   * @param {CreditDecisionInput} input
   * @returns {CreditDecisionResult}
   */
  evaluateDecision(input) {
    const { components } = input;

    validateComponent(components.pays, "components.pays");
    validateComponent(components.politique, "components.politique");
    validateComponent(components.sectoriel, "components.sectoriel");
    validateComponent(components.flux, "components.flux");
    validateComponent(components.corridor, "components.corridor");
    validateComponent(components.emprunteur, "components.emprunteur");
    validateComponent(components.change, "components.change");

    if (
      input.loanType === "dette_souveraine" &&
      SOVEREIGN_DEBT_VETO_COUNTRIES.has(input.country)
    ) {
      return veto("dette_souveraine blocked for BF/ML/NE/GN");
    }

    const rawScore =
      components.pays * DECISION_COMPONENT_WEIGHTS.pays +
      components.politique * DECISION_COMPONENT_WEIGHTS.politique +
      components.sectoriel * DECISION_COMPONENT_WEIGHTS.sectoriel +
      components.flux * DECISION_COMPONENT_WEIGHTS.flux +
      components.corridor * DECISION_COMPONENT_WEIGHTS.corridor +
      components.emprunteur * DECISION_COMPONENT_WEIGHTS.emprunteur +
      components.change * DECISION_COMPONENT_WEIGHTS.change;

    const score = round2(rawScore);

    return {
      decision_proposal: computeDecisionProposal(score),
      score,
      veto_applied: false,
      human_review_required: true,
      disclaimer: CREDIT_DECISION_DISCLAIMER,
    };
  }
}
