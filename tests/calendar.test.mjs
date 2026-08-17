/**
 * Calendar-date rules for KYC.
 *
 * These pin the boundaries a compliance check turns on, and the local-vs-UTC
 * distinction that made them wrong. The defect: verifyKyc derived "today" with
 * new Date().toISOString().slice(0,10) — the UTC date — while every date it
 * compared came from an <input type="date">, which records the applicant's own
 * calendar day. For part of every day in any zone off UTC the two differ.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  addCalendarMonths,
  expiresWithinMonths,
  isDocumentExpired,
  isMinorOn,
  majorityDate,
  todayLocalIso,
} from "../lib/africredit/calendar.js";

// ── The boundaries themselves ──────────────────────────────────────────────

test("a document expiring today is still valid all day", () => {
  // Strict comparison. A renewal due today has not lapsed yet, and treating it as
  // lapsed turns away an applicant holding a valid document.
  assert.equal(isDocumentExpired("2026-08-17", "2026-08-17"), false);
  assert.equal(isDocumentExpired("2026-08-16", "2026-08-17"), true);
  assert.equal(isDocumentExpired("2026-08-18", "2026-08-17"), false);
});

test("majority is reached on the birthday, not the day after", () => {
  assert.equal(majorityDate("2008-08-17"), "2026-08-17");
  assert.equal(isMinorOn("2008-08-17", "2026-08-17"), false, "18 today is not a minor");
  assert.equal(isMinorOn("2008-08-17", "2026-08-16"), true, "one day short is a minor");
  assert.equal(isMinorOn("2008-08-18", "2026-08-17"), true);
});

test("majority handles a 29 February birthday by clamping", () => {
  // 29 Feb 2008 + 18 years lands in 2026, which has no 29 February.
  assert.equal(majorityDate("2008-02-29"), "2026-02-28");
  assert.equal(isMinorOn("2008-02-29", "2026-02-28"), false);
  assert.equal(isMinorOn("2008-02-29", "2026-02-27"), true);
});

test("the expiry warning window excludes documents already expired", () => {
  // Already lapsed is a blocking finding, not a three-month warning — reporting
  // both would double-count the same document.
  assert.equal(expiresWithinMonths("2026-09-01", "2026-08-17", 3), true);
  assert.equal(expiresWithinMonths("2027-01-01", "2026-08-17", 3), false);
  assert.equal(expiresWithinMonths("2026-08-01", "2026-08-17", 3), false, "expired, not expiring");
});

test("addCalendarMonths clamps day-of-month overflow", () => {
  assert.equal(addCalendarMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addCalendarMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addCalendarMonths("2026-12-15", 1), "2027-01-15");
  assert.throws(() => addCalendarMonths("not-a-date", 1), /invalid date/);
});

// ── The defect this module exists to prevent ───────────────────────────────

test("todayLocalIso reads the local calendar, not the UTC one", () => {
  // A fixed instant, read two ways. Local getters are what an <input type="date">
  // agrees with; toISOString() converts to UTC first and can name a different day.
  const instant = new Date("2026-08-17T23:30:00Z");
  const local = todayLocalIso(instant);
  const utc = instant.toISOString().slice(0, 10);

  assert.match(local, /^\d{4}-\d{2}-\d{2}$/);

  const offsetMinutes = instant.getTimezoneOffset();
  if (offsetMinutes < 0) {
    // Ahead of UTC (Lagos, Nairobi): 23:30Z is already tomorrow locally.
    assert.notEqual(local, utc, "east of UTC this instant falls on the next local day");
    assert.ok(local > utc);
  } else if (offsetMinutes > 0) {
    assert.ok(local <= utc);
  } else {
    assert.equal(local, utc, "at UTC+0 the two agree");
  }
});

test("a UTC today accepts an expired document east of UTC", () => {
  // The concrete regression, expressed without depending on the host timezone.
  // Lagos is UTC+1: at 00:30 local on 18 August, UTC still reads 17 August.
  const instantUtc = "2026-08-17T23:30:00Z";
  const lagosLocalDay = "2026-08-18";
  const utcDay = new Date(instantUtc).toISOString().slice(0, 10);
  assert.equal(utcDay, "2026-08-17");

  // A document that lapsed on 17 August, judged in Lagos on 18 August.
  const expiry = "2026-08-17";
  assert.equal(isDocumentExpired(expiry, utcDay), false, "the old UTC comparison let it through");
  assert.equal(isDocumentExpired(expiry, lagosLocalDay), true, "the local comparison catches it");
});

test("a UTC today declares an adult a minor east of UTC", () => {
  const utcDay = "2026-08-17";
  const lagosLocalDay = "2026-08-18";
  const birth = "2008-08-18"; // turns 18 on the applicant's 18 August

  assert.equal(isMinorOn(birth, utcDay), true, "the old UTC comparison blocked them");
  assert.equal(isMinorOn(birth, lagosLocalDay), false, "they are 18 on their own calendar");
});

test("a UTC today rejects a valid document west of UTC", () => {
  // Los Angeles is UTC-7: at 19:00 local on 17 August, UTC already reads 18 August.
  const utcDay = new Date("2026-08-18T02:00:00Z").toISOString().slice(0, 10);
  const laLocalDay = "2026-08-17";
  assert.equal(utcDay, "2026-08-18");

  const expiry = "2026-08-17"; // valid for the whole of their 17 August
  assert.equal(isDocumentExpired(expiry, utcDay), true, "the old UTC comparison rejected it");
  assert.equal(isDocumentExpired(expiry, laLocalDay), false, "still valid on their calendar");
});
