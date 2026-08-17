/**
 * Amortisation tests. The invariants matter more than any single figure:
 * principal repaid must equal principal disbursed, payments must never create
 * or destroy money, and arrears must follow the oldest UNPAID instalment.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateCreditScore } from "../lib/africredit/credit-scoring.js";

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
  serialiseSchedule,
  firstDueDateForArrears,
  shiftDays,
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

// ── whole francs: the XOF has no collectable subunit ───────────────────────
const isWholeFranc = (centimes) => centimes % 100n === 0n;

test("every instalment is a whole number of francs", () => {
  for (const [units, rate, term] of [
    [850000, 5.5, 8], [1200000, 6, 10], [650000, 5.8, 6],
    [333333, 7.3, 7], [500000, 12, 24], [1, 9, 3]
  ]) {
    const s = buildSchedule({
      principalCentimes: XOF(units), annualRatePct: rate, termMonths: term, firstDueDate: "2026-09-01"
    });
    s.instalments.forEach((i) => {
      assert.ok(isWholeFranc(i.principalDueCentimes), `principal ${i.principalDueCentimes} not whole (${units}/${rate}/${term})`);
      assert.ok(isWholeFranc(i.interestDueCentimes), `interest ${i.interestDueCentimes} not whole (${units}/${rate}/${term})`);
      assert.ok(isWholeFranc(i.totalDueCentimes), `total ${i.totalDueCentimes} not whole (${units}/${rate}/${term})`);
    });
    // Rounding to francs must not break the core invariant.
    assert.equal(schedulePrincipalTotal(s), XOF(units));
  }
});

test("outstanding principal stays a whole franc amount as payments land", () => {
  let s = buildSchedule({
    principalCentimes: XOF(650000), annualRatePct: 5.8, termMonths: 6, firstDueDate: "2026-05-01"
  });
  assert.ok(isWholeFranc(schedulePrincipalOutstandingCentimes(s)));
  for (const units of [91000, 7, 240000, 1, 500000]) {
    s = applyPayment(s, XOF(units)).schedule;
    assert.ok(
      isWholeFranc(schedulePrincipalOutstandingCentimes(s)),
      `outstanding ${schedulePrincipalOutstandingCentimes(s)} not whole after paying ${units}`
    );
  }
});

test("the rounding unit is configurable for a currency that has centimes", () => {
  const centimeGrained = buildSchedule({
    principalCentimes: XOF(650000), annualRatePct: 5.8, termMonths: 6,
    firstDueDate: "2026-09-01", roundingUnitCentimes: 1n
  });
  const anyFraction = centimeGrained.instalments.some((i) => !isWholeFranc(i.totalDueCentimes));
  assert.equal(anyFraction, true, "unit 1 should permit sub-franc amounts");
  assert.equal(schedulePrincipalTotal(centimeGrained), XOF(650000));
});

test("the rounding unit survives serialisation", () => {
  const s = buildSchedule({
    principalCentimes: XOF(400000), annualRatePct: 6, termMonths: 4, firstDueDate: "2026-09-01"
  });
  assert.equal(s.roundingUnitCentimes, "100");
  const restored = deserialiseSchedule(JSON.parse(JSON.stringify(serialiseSchedule(s))));
  assert.equal(restored.roundingUnitCentimes, "100");
  assert.equal(schedulePrincipalTotal(restored), XOF(400000));
});

// ── Calendar-month vs day-offset drift ─────────────────────────────────────
// Regression guard for a defect that shipped in the demo fixture. Seed loans
// picked firstDueDate = today - N days, then buildSchedule advanced instalments
// by CALENDAR MONTHS. A 1-month step spans 28-31 days and a 2-month step 59-62,
// so a loan whose oldest unpaid instalment sat near today crossed the overdue
// boundary depending only on which month it landed in: two loans read Late
// through March and Watch/Current the rest of the year, swinging reported late
// exposure from 1 400 183 to 2 757 162 XOF (+96,9 %) on identical data.

test("shiftDays moves whole days and rejects junk", () => {
  assert.equal(shiftDays("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDays("2028-03-01", -1), "2028-02-29"); // leap year
  assert.equal(shiftDays("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDays("2026-05-10", 0), "2026-05-10");
  assert.throws(() => shiftDays("not-a-date", 1), /invalid ISO date/);
});

test("firstDueDateForArrears is exact when nothing is settled", () => {
  // With no settled instalments the oldest unpaid one IS the first, so no month
  // arithmetic is involved and the target date is reachable on every date.
  for (const dpd of [-30, -8, -1, 0, 5, 44]) {
    for (const today of ["2026-01-31", "2026-02-28", "2026-03-31", "2028-02-29"]) {
      const first = firstDueDateForArrears({ settledInstalments: 0, targetDaysPastDue: dpd, today });
      assert.equal(daysBetween(first, today), dpd, `dpd ${dpd} on ${today}`);
    }
  }
});

test("firstDueDateForArrears holds the arrears steady across a whole year", () => {
  // The two configurations that used to flip: one settled instalment about a
  // month back, and two settled instalments about two months back.
  const cases = [
    { settledInstalments: 1, targetDaysPastDue: -7 },
    { settledInstalments: 2, targetDaysPastDue: -9 },
    { settledInstalments: 1, targetDaysPastDue: 9 },
    { settledInstalments: 2, targetDaysPastDue: 44 },
    { settledInstalments: 3, targetDaysPastDue: -20 },
  ];

  for (const input of cases) {
    const observed = new Set();
    const start = Date.parse("2026-01-01T00:00:00Z");
    for (let k = 0; k < 400; k += 1) {
      const today = new Date(start + k * 86400000).toISOString().slice(0, 10);
      const firstDueDate = firstDueDateForArrears({ ...input, today });
      const schedule = buildSchedule({
        principalCentimes: 600_000n * 100n,
        annualRatePct: 6,
        termMonths: 12,
        firstDueDate,
      });
      // Mark the settled instalments paid, exactly as the fixture does.
      const paid = schedule.instalments
        .slice(0, input.settledInstalments)
        .reduce((sum, i) => sum + i.totalDueCentimes, 0n);
      const settledSchedule = paid > 0n ? applyPayment(schedule, paid).schedule : schedule;
      const oldest = settledSchedule.instalments.find((i) => i.paidCentimes < i.totalDueCentimes);
      observed.add(daysBetween(oldest.dueDate, today));
    }

    const values = [...observed];
    // A +/-1 day wobble is inherent to calendar months — an instalment due the
    // 31st falls on the 28th in February. What must never happen is crossing a
    // decision boundary, which is what flipped a loan's status.
    for (const value of values) {
      assert.ok(Math.abs(value - input.targetDaysPastDue) <= 3,
        `dpd ${value} drifted more than 3 days from ${input.targetDaysPastDue}`);
    }
    // 81 is not a PAR band: it is where the app's paymentHistory ramp
    // (100 - round(dpd * 100 / 90)) crosses below 10 and trips the engine's
    // "Payment history below minimum threshold" veto. dpd 81 gives 10, dpd 82
    // gives 9. A target sitting there would flip an approval to a refusal with
    // the calendar, so it belongs in this list alongside the PAR bands.
    for (const boundary of [0, 30, 60, 81, 90]) {
      const above = values.some((v) => v > boundary);
      const below = values.some((v) => v <= boundary);
      assert.ok(!(above && below),
        `settled=${input.settledInstalments} target=${input.targetDaysPastDue} straddles ${boundary}: {${values.sort((a, b) => a - b)}}`);
    }
  }
});

test("the demo fixture keeps every arrears target clear of a decision boundary", () => {
  // A lint over the real seed data: a target within 3 days of 0, 30, 60 or 90
  // could be pushed across it by month-end clamping and would reintroduce the
  // drift. Loans with nothing settled are exempt — their first instalment date
  // is exact, so no month arithmetic can move it.
  const src = readFileSync(new URL("../microfinance-app/app.js", import.meta.url), "utf8");
  const specs = [...src.matchAll(/seedLoan\((\{[\s\S]*?\})\)/g)].map((m) => ({
    id: (m[1].match(/id:\s*"([^"]+)"/) || [])[1],
    dpd: Number((m[1].match(/oldestUnpaidDpd:\s*(-?\d+)/) || [])[1]),
    settled: Number((m[1].match(/settled:\s*(\d+)/) || [, 0])[1]),
  }));

  assert.ok(specs.length >= 20, `expected the seed fixture, parsed ${specs.length} specs`);
  assert.ok(!/firstDueOffsetDays/.test(src),
    "firstDueOffsetDays is back in the fixture — that is the day-vs-month mismatch");

  for (const spec of specs) {
    assert.ok(Number.isFinite(spec.dpd), `${spec.id} has no oldestUnpaidDpd`);
    if (spec.settled === 0) continue;
    // Includes 81, the paymentHistory veto crossing — see the note above.
    for (const boundary of [0, 30, 60, 81, 90]) {
      assert.ok(Math.abs(spec.dpd - boundary) > 3,
        `${spec.id} target ${spec.dpd} sits within 3 days of the ${boundary}-day boundary`);
    }
  }
});

test("the paymentHistory ramp crosses the engine's veto between 81 and 82 days", () => {
  // Justifies including 81 in the boundary lists above. The app derives
  // paymentHistory from days past due; the engine refuses below 10.
  const paymentHistory = (dpd) => Math.max(0, Math.min(100, 100 - Math.round((dpd * 100) / 90)));

  assert.equal(paymentHistory(81), 10, "81 days still clears the veto");
  assert.equal(paymentHistory(82), 9, "82 days trips it");

  const base = {
    debtRatio: 35, sectorRisk: "MEDIUM", governanceScore: 78,
    collateralValue: 22_000_000, cashFlowStability: "STABLE", countryRisk: "SN",
  };
  assert.equal(calculateCreditScore({ ...base, paymentHistory: paymentHistory(81) }).status, "APPROVED");
  assert.equal(calculateCreditScore({ ...base, paymentHistory: paymentHistory(82) }).status, "VETOED");
});
