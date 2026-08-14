/**
 * AfriCredit — amortisation schedules and instalment-level arrears.
 *
 * Why this exists: PAR was previously computed against a single `nextDueDate`
 * per loan. That date never moved when a client paid, so once PAR followed
 * real arrears a loan stayed overdue no matter how much was repaid — PAR could
 * never come down. A PAR figure shown to an investor has to rest on the oldest
 * UNPAID INSTALMENT, which requires a schedule.
 *
 * Conventions, stated because they change the numbers:
 *  - Money is bigint in XOF centimes. Never floats: a rounding drift of one
 *    centime per instalment would misstate a portfolio.
 *  - `annualRatePct` is a NOMINAL ANNUAL rate; the periodic rate is
 *    annualRatePct / 12 / 100. The app's ceiling policy (6 / 9 / 12 %) is
 *    expressed the same way.
 *  - Equal-total-payment (annuity) instalments. Interest is charged on the
 *    declining balance; the final instalment absorbs rounding residue so the
 *    principal repaid equals the principal disbursed EXACTLY.
 *  - Payments are allocated oldest instalment first, the standard waterfall.
 *  - Every instalment is a WHOLE NUMBER OF FRANCS. The XOF has no circulating
 *    subunit, so an instalment of 110 163,53 XOF is not collectable — a teller
 *    cannot take 53 centimes. Amounts are held in centimes for consistency with
 *    lib/banking-engine.js, but constrained to multiples of 100. Override with
 *    `roundingUnitCentimes` only for a currency that really has a minor unit.
 *
 * @typedef {Object} Instalment
 * @property {number} n                    1-based instalment number
 * @property {string} dueDate              ISO yyyy-mm-dd
 * @property {bigint} principalDueCentimes
 * @property {bigint} interestDueCentimes
 * @property {bigint} totalDueCentimes
 * @property {bigint} paidCentimes
 *
 * @typedef {Object} Schedule
 * @property {string} basis                "annuity"
 * @property {number} annualRatePct
 * @property {bigint} principalCentimes
 * @property {Instalment[]} instalments
 */

/** Safe integer ceiling for centime amounts handled as Numbers internally. */
const MAX_CENTIMES = BigInt(Number.MAX_SAFE_INTEGER);

/** Adds whole months to an ISO date, clamping day-of-month overflow. */
export function addMonths(isoDate, months) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  if (!y || !m || !d) throw new Error("addMonths: invalid ISO date " + isoDate);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // 31 Jan + 1 month must land on 28/29 Feb, not 2/3 March.
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(isoA, isoB) {
  const a = Date.parse(isoA + "T00:00:00Z");
  const b = Date.parse(isoB + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Rounds a centime amount to the nearest whole collectable unit, half-up.
 * @param {bigint} centimes
 * @param {bigint} unit
 * @returns {bigint}
 */
function roundToUnit(centimes, unit) {
  if (unit <= 1n) return centimes;
  const remainder = centimes % unit;
  if (remainder === 0n) return centimes;
  return remainder * 2n >= unit ? centimes - remainder + unit : centimes - remainder;
}

function toCentimes(value, label) {
  if (typeof value === "bigint") return value;
  if (!Number.isFinite(value)) throw new Error(label + " must be a finite amount");
  return BigInt(Math.round(value));
}

/**
 * Builds an annuity schedule.
 * @param {{principalCentimes: bigint|number, annualRatePct: number, termMonths: number, firstDueDate: string}} input
 * @returns {Schedule}
 */
/** Adds whole days to an ISO date. */
export function shiftDays(isoDate, days) {
  const t = Date.parse(String(isoDate) + "T00:00:00Z");
  if (Number.isNaN(t)) throw new Error("shiftDays: invalid ISO date " + isoDate);
  return new Date(t + Math.trunc(days) * 86400000).toISOString().slice(0, 10);
}

/**
 * The first due date that puts a schedule's oldest UNPAID instalment exactly
 * `targetDaysPastDue` days past `today` — negative meaning that many days
 * BEFORE it falls due.
 *
 * Why this exists: a fixture naturally thinks in "days from today", while a
 * schedule advances in CALENDAR MONTHS. Choosing firstDueDate = today - N days
 * and letting buildSchedule step forward by months races two different units —
 * a 1-month step spans 28 to 31 days and a 2-month step 59 to 62 — so an
 * instalment placed near today crosses the overdue boundary depending only on
 * which month it lands in. A demo built that way reports one set of arrears in
 * February and a different set in March, from identical data.
 *
 * The fix is to solve for the first due date instead of guessing it: shift the
 * candidate by whatever drift addMonths introduces and re-measure. Two passes
 * suffice in practice, and the loop is bounded because moving the candidate one
 * day moves the landing date exactly one day except at month-end clamping,
 * which the next pass absorbs.
 *
 * Exactness caveat: addMonths clamps day-of-month overflow (31 Jan + 1 month is
 * 28 Feb), so a target landing on a 29th/30th/31st is unreachable for
 * settledInstalments >= 1 and the closest achievable date is returned instead —
 * off by at most three days. Keep |targetDaysPastDue| >= 4 and the sign, and
 * therefore the loan's status, is stable on every date of every year.
 *
 * @param {{settledInstalments?: number, targetDaysPastDue?: number, today: string}} input
 * @returns {string} ISO first due date
 */
export function firstDueDateForArrears({ settledInstalments = 0, targetDaysPastDue = 0, today }) {
  const settled = Math.max(0, Math.trunc(Number(settledInstalments) || 0));
  const target = shiftDays(today, -Math.trunc(Number(targetDaysPastDue) || 0));

  // With nothing settled the oldest unpaid instalment IS the first one, so the
  // target date is the answer and no month arithmetic is involved at all.
  if (settled === 0) return target;

  let candidate = shiftDays(target, -settled * 30);
  let best = candidate;
  let bestDrift = Infinity;
  for (let pass = 0; pass < 6; pass += 1) {
    const drift = daysBetween(addMonths(candidate, settled), target);
    if (Math.abs(drift) < Math.abs(bestDrift)) {
      best = candidate;
      bestDrift = drift;
    }
    if (drift === 0) return candidate;
    candidate = shiftDays(candidate, drift);
  }
  return best;
}

export function buildSchedule({
  principalCentimes,
  annualRatePct,
  termMonths,
  firstDueDate,
  roundingUnitCentimes = 100n
}) {
  const principal = toCentimes(principalCentimes, "principalCentimes");
  if (principal <= 0n) throw new Error("principalCentimes must be greater than 0");
  if (principal > MAX_CENTIMES) throw new Error("principalCentimes exceeds MAX_SAFE_INTEGER");
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new Error("termMonths must be a positive integer");
  }
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0) {
    throw new Error("annualRatePct must be zero or positive");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(firstDueDate))) {
    throw new Error("firstDueDate must be an ISO yyyy-mm-dd date");
  }

  const unit = BigInt(roundingUnitCentimes) > 0n ? BigInt(roundingUnitCentimes) : 1n;
  const periodicRate = annualRatePct / 12 / 100;
  const principalNum = Number(principal);

  // Level payment, rounded to a collectable amount. At a zero rate this
  // degenerates to principal / n.
  const paymentNum = periodicRate === 0
    ? principalNum / termMonths
    : (principalNum * periodicRate) / (1 - Math.pow(1 + periodicRate, -termMonths));
  const payment = roundToUnit(BigInt(Math.round(paymentNum)), unit);

  const instalments = [];
  let balance = principal;

  for (let n = 1; n <= termMonths; n += 1) {
    const isLast = n === termMonths;
    const interest = periodicRate === 0
      ? 0n
      : roundToUnit(BigInt(Math.round(Number(balance) * periodicRate)), unit);

    // The last instalment clears the balance exactly, absorbing all residue.
    let principalPart = isLast ? balance : payment - interest;
    if (principalPart < 0n) principalPart = 0n;          // rate so high interest exceeds the payment
    if (!isLast && principalPart > balance) principalPart = balance;

    instalments.push({
      n,
      dueDate: addMonths(firstDueDate, n - 1),
      principalDueCentimes: principalPart,
      interestDueCentimes: interest,
      totalDueCentimes: principalPart + interest,
      paidCentimes: 0n
    });

    balance -= principalPart;
  }

  return {
    basis: "annuity",
    annualRatePct,
    roundingUnitCentimes: unit.toString(),
    principalCentimes: principal,
    instalments
  };
}

/** Total principal across the schedule — must equal the amount disbursed. */
export function schedulePrincipalTotal(schedule) {
  return schedule.instalments.reduce((sum, i) => sum + i.principalDueCentimes, 0n);
}

/** Total still owed across all instalments. */
export function scheduleOutstandingCentimes(schedule) {
  return schedule.instalments.reduce(
    (sum, i) => sum + (i.totalDueCentimes - i.paidCentimes),
    0n
  );
}

/**
 * Outstanding PRINCIPAL, which is what PAR must be measured against — not
 * principal + interest. Within an instalment a payment covers interest first,
 * then principal, the standard waterfall.
 * @param {Schedule} schedule
 * @returns {bigint}
 */
export function schedulePrincipalOutstandingCentimes(schedule) {
  return schedule.instalments.reduce((sum, i) => {
    const towardsPrincipal = i.paidCentimes > i.interestDueCentimes
      ? i.paidCentimes - i.interestDueCentimes
      : 0n;
    const covered = towardsPrincipal > i.principalDueCentimes ? i.principalDueCentimes : towardsPrincipal;
    return sum + (i.principalDueCentimes - covered);
  }, 0n);
}

/**
 * Allocates a payment oldest instalment first.
 * Returns a NEW schedule plus any amount left over once every instalment is
 * settled, so the caller can decide what a prepayment means.
 * @param {Schedule} schedule
 * @param {bigint|number} amountCentimes
 * @returns {{schedule: Schedule, excessCentimes: bigint, instalmentsSettled: number}}
 */
export function applyPayment(schedule, amountCentimes) {
  let remaining = toCentimes(amountCentimes, "amountCentimes");
  if (remaining < 0n) throw new Error("amountCentimes must not be negative");

  let settled = 0;
  const instalments = schedule.instalments.map((instalment) => {
    if (remaining <= 0n) return { ...instalment };
    const owed = instalment.totalDueCentimes - instalment.paidCentimes;
    if (owed <= 0n) return { ...instalment };

    const applied = remaining >= owed ? owed : remaining;
    remaining -= applied;
    const paidCentimes = instalment.paidCentimes + applied;
    if (paidCentimes >= instalment.totalDueCentimes) settled += 1;
    return { ...instalment, paidCentimes };
  });

  return {
    schedule: { ...schedule, instalments },
    excessCentimes: remaining,
    instalmentsSettled: settled
  };
}

/**
 * Arrears measured against the oldest UNPAID instalment — the figure PAR must
 * be based on.
 * @param {Schedule} schedule
 * @param {string} todayIso
 * @returns {{daysPastDue: number, nextDueDate: string|null, oldestUnpaidDueDate: string|null,
 *            overdueCentimes: bigint, overdueInstalments: number, settled: boolean}}
 */
export function scheduleArrears(schedule, todayIso) {
  const today = String(todayIso).slice(0, 10);
  const unpaid = schedule.instalments.filter((i) => i.paidCentimes < i.totalDueCentimes);

  if (!unpaid.length) {
    return {
      daysPastDue: 0,
      nextDueDate: null,
      oldestUnpaidDueDate: null,
      overdueCentimes: 0n,
      overdueInstalments: 0,
      settled: true
    };
  }

  const overdue = unpaid.filter((i) => daysBetween(i.dueDate, today) > 0);
  const overdueCentimes = overdue.reduce(
    (sum, i) => sum + (i.totalDueCentimes - i.paidCentimes),
    0n
  );

  return {
    daysPastDue: overdue.length ? daysBetween(overdue[0].dueDate, today) : 0,
    nextDueDate: unpaid[0].dueDate,
    oldestUnpaidDueDate: overdue.length ? overdue[0].dueDate : null,
    overdueCentimes,
    overdueInstalments: overdue.length,
    settled: false
  };
}

/** Serialises a schedule for storage (bigint is not JSON-safe). */
export function serialiseSchedule(schedule) {
  return {
    basis: schedule.basis,
    annualRatePct: schedule.annualRatePct,
    roundingUnitCentimes: String(schedule.roundingUnitCentimes ?? "100"),
    principalCentimes: schedule.principalCentimes.toString(),
    instalments: schedule.instalments.map((i) => ({
      n: i.n,
      dueDate: i.dueDate,
      principalDueCentimes: i.principalDueCentimes.toString(),
      interestDueCentimes: i.interestDueCentimes.toString(),
      totalDueCentimes: i.totalDueCentimes.toString(),
      paidCentimes: i.paidCentimes.toString()
    }))
  };
}

/** Restores a stored schedule. Returns null when the input is unusable. */
export function deserialiseSchedule(raw) {
  if (!raw || !Array.isArray(raw.instalments) || !raw.instalments.length) return null;
  try {
    return {
      basis: raw.basis || "annuity",
      annualRatePct: Number(raw.annualRatePct) || 0,
      roundingUnitCentimes: String(raw.roundingUnitCentimes ?? "100"),
      principalCentimes: BigInt(raw.principalCentimes || "0"),
      instalments: raw.instalments.map((i) => ({
        n: Number(i.n),
        dueDate: String(i.dueDate),
        principalDueCentimes: BigInt(i.principalDueCentimes || "0"),
        interestDueCentimes: BigInt(i.interestDueCentimes || "0"),
        totalDueCentimes: BigInt(i.totalDueCentimes || "0"),
        paidCentimes: BigInt(i.paidCentimes || "0")
      }))
    };
  } catch {
    return null;
  }
}
