/**
 * Calendar-date rules for KYC and arrears.
 *
 * The distinction this module exists to enforce: a date typed into an
 * `<input type="date">` is a BARE CALENDAR DATE on the user's own calendar —
 * "2026-08-17" with no timezone attached. Deriving "today" with
 * `new Date().toISOString().slice(0, 10)` gives the UTC calendar date instead,
 * and the two are different days for part of every day in any zone off UTC.
 *
 * Measured consequence before this module existed, with verifyKyc comparing
 * against a UTC today:
 *
 *   Lagos (UTC+1) at 00:30 local   -> an identity document that expired
 *   Nairobi (UTC+3) at 01:00 local     yesterday was ACCEPTED, and an applicant
 *                                      turning 18 that day was declared a minor.
 *   Los Angeles (UTC-7) at 19:00   -> a document valid until today was rejected
 *                                      as expired.
 *
 * Lagos and Nairobi are inside the coverage this platform serves, so this was not
 * a theoretical edge: an agent working late or early got the wrong verdict, and
 * the lax direction let an expired document through a compliance check.
 *
 * Every function here takes calendar-date strings and an explicit `today`, so the
 * rules are deterministic and testable without mocking the clock.
 */

/**
 * Today's date on the LOCAL calendar, as YYYY-MM-DD.
 *
 * Uses the local getters deliberately. `toISOString()` would convert to UTC
 * first, which is the defect described above.
 *
 * @param {Date} [now] Injectable for tests.
 * @returns {string}
 */
export function todayLocalIso(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Adds whole months to a calendar date, clamping day-of-month overflow. */
export function addCalendarMonths(isoDate, months) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  if (!y || !m || !d) throw new Error("addCalendarMonths: invalid date " + isoDate);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * True when the document is no longer valid.
 *
 * A document expiring ON `today` is still valid for the whole of that day, so the
 * comparison is strict.
 */
export function isDocumentExpired(expiryIso, todayIso) {
  if (!expiryIso || !todayIso) return false;
  return String(expiryIso) < String(todayIso);
}

/** True when the document expires within `months` of today (and is not already expired). */
export function expiresWithinMonths(expiryIso, todayIso, months) {
  if (!expiryIso || !todayIso) return false;
  if (isDocumentExpired(expiryIso, todayIso)) return false;
  return String(expiryIso) < addCalendarMonths(todayIso, months);
}

/** The date the person born on `birthIso` reaches `years`. */
export function majorityDate(birthIso, years = 18) {
  return addCalendarMonths(birthIso, years * 12);
}

/**
 * True when the person is below the age of majority on `today`.
 *
 * Someone whose birthday falls ON today has reached majority, so the comparison
 * is strict — a `>` rather than `>=`.
 */
export function isMinorOn(birthIso, todayIso, years = 18) {
  if (!birthIso || !todayIso) return false;
  return majorityDate(birthIso, years) > String(todayIso);
}
