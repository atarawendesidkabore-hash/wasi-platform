/**
 * Banking engine tests — harvested from the React app's Jest suite and ported
 * to node:test. Extra cases cover the double-entry guarantee and immutability,
 * which matter for a ledger and were untested before.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_MONETARY_AMOUNT_CENTIMES,
  createInitialBankingState,
  deposit,
  formatXofCentimes,
  parseInputAmountToCentimes,
  transfer,
  withdraw,
} from "../lib/banking-engine.js";

const balanceOf = (state, id) =>
  state.accounts.find((account) => account.id === id).balanceCentimes;

test("parses decimal amount to centimes, comma or dot", () => {
  assert.equal(parseInputAmountToCentimes("1250.5"), 125050n);
  assert.equal(parseInputAmountToCentimes("1250,50"), 125050n);
  assert.equal(parseInputAmountToCentimes("1250"), 125000n);
  assert.equal(parseInputAmountToCentimes(" 7,05 "), 705n);
});

test("rejects invalid format rather than rounding a customer's money", () => {
  assert.throws(() => parseInputAmountToCentimes("12.345"), /Invalid amount format\./);
  assert.throws(() => parseInputAmountToCentimes("-5"), /Invalid amount format\./);
  assert.throws(() => parseInputAmountToCentimes("abc"), /Invalid amount format\./);
  assert.throws(() => parseInputAmountToCentimes(""), /Invalid amount format\./);
});

test("rejects amount over max bound", () => {
  const huge = (MAX_MONETARY_AMOUNT_CENTIMES + 1n).toString();
  assert.throws(() => parseInputAmountToCentimes(huge), /Amount is out of supported bounds\./);
});

test("formats centimes for display", () => {
  assert.equal(formatXofCentimes(125000000n), "1 250 000.00 XOF");
  assert.equal(formatXofCentimes(705n), "7.05 XOF");
  assert.equal(formatXofCentimes(-705n), "-7.05 XOF");
});

test("deposit increases balance and records transaction", () => {
  const state = createInitialBankingState();
  const next = deposit(state, "acc_main", 10000n, "Cash in");
  assert.equal(balanceOf(next, "acc_main"), 125010000n);
  assert.equal(next.transactions[0].kind, "DEPOSIT");
  assert.equal(next.transactions[0].description, "Cash in");
});

test("operations are pure: the original state is untouched", () => {
  const state = createInitialBankingState();
  const before = balanceOf(state, "acc_main");
  deposit(state, "acc_main", 10000n);
  assert.equal(balanceOf(state, "acc_main"), before);
  assert.equal(state.transactions.length, 0);
});

test("withdraw rejects out-of-bounds and insufficient funds", () => {
  const state = createInitialBankingState();
  assert.throws(
    () => withdraw(state, "acc_main", MAX_MONETARY_AMOUNT_CENTIMES + 1n),
    /Amount is out of supported bounds\./
  );
  assert.throws(() => withdraw(state, "acc_main", 999999999n), /Insufficient funds\./);
});

test("withdraw of the exact balance is allowed", () => {
  const state = createInitialBankingState();
  const next = withdraw(state, "acc_main", 125000000n);
  assert.equal(balanceOf(next, "acc_main"), 0n);
});

test("unknown account is rejected", () => {
  const state = createInitialBankingState();
  assert.throws(() => deposit(state, "acc_nope", 100n), /Account not found\./);
});

test("transfer moves funds and writes in/out transactions", () => {
  const state = createInitialBankingState();
  const next = transfer(state, "acc_main", "acc_savings", 15000n, "Savings top-up");
  assert.equal(balanceOf(next, "acc_main"), 124985000n);
  assert.equal(balanceOf(next, "acc_savings"), 345515000n);
  assert.equal(next.transactions[0].kind, "TRANSFER_OUT");
  assert.equal(next.transactions[1].kind, "TRANSFER_IN");
});

test("transfer conserves the total ledger value (double entry)", () => {
  const state = createInitialBankingState();
  const total = (s) => s.accounts.reduce((sum, a) => sum + a.balanceCentimes, 0n);
  const before = total(state);
  const next = transfer(state, "acc_business", "acc_main", 5_000_000n);
  assert.equal(total(next), before);
});

test("transfer refuses same-account and insufficient funds", () => {
  const state = createInitialBankingState();
  assert.throws(() => transfer(state, "acc_main", "acc_main", 100n), /same account/);
  assert.throws(() => transfer(state, "acc_main", "acc_savings", 999999999n), /Insufficient funds\./);
});

test("transaction ids are unique", () => {
  let state = createInitialBankingState();
  for (let i = 0; i < 25; i += 1) state = deposit(state, "acc_main", 100n);
  const ids = new Set(state.transactions.map((t) => t.id));
  assert.equal(ids.size, state.transactions.length);
});
