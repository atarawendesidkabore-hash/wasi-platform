/**
 * Amortisation tests. The invariants matter more than any single figure:
 * principal repaid must equal principal disbursed, payments must never create
 * or destroy money, and arrears must follow the oldest UNPAID instalment.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  addMonths,
  applyPayment,
  buildSchedule,
  daysBetween,
  deserialiseSchedule,
  scheduleArrears,
  scheduleOutstandingCentimes,
  schedulePrincipalOutstandingCentimes,
  schedulePrincipalTotal,
  serialiseSchedule
} from "../lib/africredit/amortisation.js";

const XOF = (units) => BigInt(units) * 100n;

// ── date helpers ───────────────────────────────────────────────────────────
test("addMonths clamps day-of-month overflow", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29"); // leap year
  assert.equal(addMonths("2026-03-15", 0), "2026-03-15");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
  assert.equal(addMonths("2026-12-31", 1), "2027-01-31");
});

test("daysBetween counts whole days and survives bad input", () => {
  assert.equal(daysBetween("2026-03-01", "2026-03-31"), 30);
  assert.equal(daysBetween("2026-03-31", "2026-03-01"), -30);
  assert.equal(daysBetween("nonsense", "2026-03-01"), 0);
});

// ── schedule construction ──────────────────────────────────────────────────
test("principal repaid equals principal disbursed, to the centime", () => {
  for (const [units, rate, term] of [
    [850000, 5.5, 8], [1200000, 6, 10], [650000, 5.8, 6],
    [500000, 12, 24], [333333, 7.3, 7], [1, 9, 3], [999999, 0, 5]
  ]) {
    const s = buildSchedule({
      principalCentimes: XOF(units), annualRatePct: rate, termMonths: term, firstDueDate: "2026-09-01"
    });
    assert.equal(schedulePrincipalTotal(s), XOF(units), `principal mismatch for ${units}/${rate}/${term}`);
    assert.equal(s.instalments.length, term);
  }
});

test("instalment totals are principal + interest and due dates are monthly", () => {
  const s = buildSchedule({
    principalCentimes: XOF(600000), annualRatePct: 6, termMonths: 6, firstDueDate: "2026-09-10"
  });
  s.instalments.forEach((i, idx) => {
    assert.equal(i.totalDueCentimes, i.principalDueCentimes + i.interestDueCentimes);
    assert.equal(i.dueDate, addMonths("2026-09-10", idx));
    assert.equal(i.paidCentimes, 0n);
    assert.equal(i.n, idx + 1);
  });
});

test("a zero rate charges no interest and splits principal evenly", () => {
  const s = buildSchedule({
    principalCentimes: XOF(120000), annualRatePct: 0, termMonths: 6, firstDueDate: "2026-09-01"
  });
  assert.equal(s.instalments.every((i) => i.interestDueCentimes === 0n), true);
  assert.equal(schedulePrincipalTotal(s), XOF(120000));
  assert.equal(s.instalments[0].totalDueCentimes, XOF(20000));
});

test("interest declines as the balance amortises", () => {
  const s = buildSchedule({
    principalCentimes: XOF(1000000), annualRatePct: 12, termMonths: 12, firstDueDate: "2026-09-01"
  });
  for (let i = 1; i < s.instalments.length; i += 1) {
    assert.ok(
      s.instalments[i].interestDueCentimes <= s.instalments[i - 1].interestDueCentimes,
      "interest must not increase at instalment " + (i + 1)
    );
  }
  assert.ok(s.instalments[0].interestDueCentimes > 0n);
});

test("rejects invalid inputs instead of producing a silent schedule", () => {
  const ok = { principalCentimes: XOF(100000), annualRatePct: 6, termMonths: 6, firstDueDate: "2026-09-01" };
  assert.throws(() => buildSchedule({ ...ok, principalCentimes: 0n }), /greater than 0/);
  assert.throws(() => buildSchedule({ ...ok, termMonths: 0 }), /positive integer/);
  assert.throws(() => buildSchedule({ ...ok, termMonths: 2.5 }), /positive integer/);
  assert.throws(() => buildSchedule({ ...ok, annualRatePct: -1 }), /zero or positive/);
  assert.throws(() => buildSchedule({ ...ok, firstDueDate: "01/09/2026" }), /ISO/);
});

// ── payment waterfall ──────────────────────────────────────────────────────
const base = () => buildSchedule({
  principalCentimes: XOF(600000), annualRatePct: 0, termMonths: 6, firstDueDate: "2026-09-01"
});

test("a payment settles the oldest instalment first", () => {
  // base() is 600 000 XOF over 6 months at 0%, so one instalment is 100 000.
  const { schedule, instalmentsSettled, excessCentimes } = applyPayment(base(), XOF(100000));
  assert.equal(instalmentsSettled, 1);
  assert.equal(excessCentimes, 0n);
  assert.equal(schedule.instalments[0].paidCentimes, XOF(100000));
  assert.equal(schedule.instalments[1].paidCentimes, 0n);
});

test("a payment cascades across instalments", () => {
  const { schedule, instalmentsSettled } = applyPayment(base(), XOF(250000));
  assert.equal(instalmentsSettled, 2);
  assert.equal(schedule.instalments[0].paidCentimes, XOF(100000));
  assert.equal(schedule.instalments[1].paidCentimes, XOF(100000));
  assert.equal(schedule.instalments[2].paidCentimes, XOF(50000)); // partial
});

test("payments never create or destroy money", () => {
  let s = base();
  const total = scheduleOutstandingCentimes(s);
  let paidIn = 0n;
  for (const amount of [XOF(5000), XOF(37000), XOF(1), XOF(80000)]) {
    const r = applyPayment(s, amount);
    s = r.schedule;
    paidIn += amount - r.excessCentimes;
  }
  assert.equal(scheduleOutstandingCentimes(s), total - paidIn);
});

test("an overpayment is reported as excess, not absorbed silently", () => {
  const r = applyPayment(base(), XOF(700000));
  assert.equal(scheduleOutstandingCentimes(r.schedule), 0n);
  assert.equal(r.excessCentimes, XOF(100000));
  assert.equal(r.instalmentsSettled, 6);
});

test("applyPayment does not mutate the input schedule", () => {
  const s = base();
  applyPayment(s, XOF(20000));
  assert.equal(s.instalments[0].paidCentimes, 0n);
});

test("a zero payment is a no-op and a negative one is refused", () => {
  const r = applyPayment(base(), 0n);
  assert.equal(scheduleOutstandingCentimes(r.schedule), XOF(600000));
  assert.throws(() => applyPayment(base(), -1n), /must not be negative/);
});

// ── arrears: the reason this module exists ─────────────────────────────────
test("arrears follow the OLDEST UNPAID instalment", () => {
  const s = buildSchedule({
    principalCentimes: XOF(600000), annualRatePct: 0, termMonths: 6, firstDueDate: "2026-05-01"
  });
  // On 15 Aug, instalments due 1 May / 1 Jun / 1 Jul / 1 Aug are all overdue.
  const a = scheduleArrears(s, "2026-08-15");
  assert.equal(a.oldestUnpaidDueDate, "2026-05-01");
  assert.equal(a.daysPastDue, daysBetween("2026-05-01", "2026-08-15"));
  assert.equal(a.overdueInstalments, 4);
  assert.equal(a.overdueCentimes, XOF(400000));
  assert.equal(a.nextDueDate, "2026-05-01");
});

test("paying the oldest instalments reduces days past due — the bug this fixes", () => {
  const s = buildSchedule({
    principalCentimes: XOF(600000), annualRatePct: 0, termMonths: 6, firstDueDate: "2026-05-01"
  });
  const before = scheduleArrears(s, "2026-08-15");

  const after = scheduleArrears(applyPayment(s, XOF(300000)).schedule, "2026-08-15");
  assert.ok(after.daysPastDue < before.daysPastDue, "arrears must fall after paying");
  assert.equal(after.oldestUnpaidDueDate, "2026-08-01");
  assert.equal(after.overdueInstalments, 1);
  assert.equal(after.nextDueDate, "2026-08-01");
});

test("a fully paid schedule reports no arrears and no next due date", () => {
  const paid = applyPayment(base(), XOF(600000)).schedule;
  const a = scheduleArrears(paid, "2030-01-01");
  assert.equal(a.settled, true);
  assert.equal(a.daysPastDue, 0);
  assert.equal(a.nextDueDate, null);
  assert.equal(a.overdueCentimes, 0n);
});

test("a loan paid up to date reports 0 days past due with a future next date", () => {
  const s = buildSchedule({
    principalCentimes: XOF(600000), annualRatePct: 0, termMonths: 6, firstDueDate: "2026-05-01"
  });
  const a = scheduleArrears(applyPayment(s, XOF(400000)).schedule, "2026-08-15");
  assert.equal(a.daysPastDue, 0);
  assert.equal(a.overdueInstalments, 0);
  assert.equal(a.nextDueDate, "2026-09-01"); // next instalment, not yet due
  assert.equal(a.settled, false);
});

// ── persistence round-trip ─────────────────────────────────────────────────
test("a schedule survives serialisation with bigints intact", () => {
  const s = applyPayment(
    buildSchedule({ principalCentimes: XOF(750000), annualRatePct: 7.5, termMonths: 9, firstDueDate: "2026-06-20" }),
    XOF(31000)
  ).schedule;

  const restored = deserialiseSchedule(JSON.parse(JSON.stringify(serialiseSchedule(s))));
  assert.equal(restored.instalments.length, s.instalments.length);
  assert.equal(schedulePrincipalTotal(restored), schedulePrincipalTotal(s));
  assert.equal(scheduleOutstandingCentimes(restored), scheduleOutstandingCentimes(s));
  assert.deepEqual(
    scheduleArrears(restored, "2026-09-01"),
    scheduleArrears(s, "2026-09-01")
  );
});

test("deserialise refuses junk rather than returning a broken schedule", () => {
  assert.equal(deserialiseSchedule(null), null);
  assert.equal(deserialiseSchedule({}), null);
  assert.equal(deserialiseSchedule({ instalments: [] }), null);
  assert.equal(deserialiseSchedule({ instalments: [{ principalDueCentimes: "abc" }] }), null);
});

// ── outstanding principal: what PAR is measured on ─────────────────────────
test("outstanding principal starts at the disbursed amount", () => {
  const s = buildSchedule({
    principalCentimes: XOF(600000), annualRatePct: 6, termMonths: 6, firstDueDate: "2026-09-01"
  });
  assert.equal(schedulePrincipalOutstandingCentimes(s), XOF(600000));
});

test("a payment covers interest before principal", () => {
  const s = buildSchedule({
    principalCentimes: XOF(600000), annualRatePct: 12, termMonths: 6, firstDueDate: "2026-09-01"
  });
  const first = s.instalments[0];
  assert.ok(first.interestDueCentimes > 0n, "expected interest on the first instalment");

  // Paying exactly the interest must not reduce principal at all.
  const interestOnly = applyPayment(s, first.interestDueCentimes).schedule;
  assert.equal(schedulePrincipalOutstandingCentimes(interestOnly), XOF(600000));

  // Paying the full instalment reduces principal by its principal portion.
  const full = applyPayment(s, first.totalDueCentimes).schedule;
  assert.equal(
    schedulePrincipalOutstandingCentimes(full),
    XOF(600000) - first.principalDueCentimes
  );
});

test("a fully paid schedule owes no principal", () => {
  const s = buildSchedule({
    principalCentimes: XOF(450000), annualRatePct: 7, termMonths: 9, firstDueDate: "2026-09-01"
  });
  const total = scheduleOutstandingCentimes(s);
  assert.equal(schedulePrincipalOutstandingCentimes(applyPayment(s, total).schedule), 0n);
});
