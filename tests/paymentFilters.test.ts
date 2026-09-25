import { test } from "node:test";
import assert from "node:assert/strict";
import { dateBounds, matchesPaymentFilters, parsePaymentFilters, paymentFiltersToQuery, paymentWhere } from "../lib/paymentFilters";

const base = {
  businessName: "Olive & Co",
  contactName: "Sara",
  email: "sara@example.com",
  receiptNumber: "DAH-2026-0042",
  providerRef: "BANK-991",
  status: "SUCCEEDED",
  refundedAedFils: 0,
  needsAttention: null,
  provider: "offline",
  createdAt: "2026-09-24T21:30:00Z", // 01:30 on 25 Sep in Dubai
};

test("parse drops malformed input and maps legacy status names", () => {
  assert.deepEqual(parsePaymentFilters({ status: "SUCCEEDED" }), { status: "PAID" });
  assert.deepEqual(parsePaymentFilters({ status: "PENDING" }), { status: "IN_PROGRESS" });
  assert.deepEqual(parsePaymentFilters({ status: "DROP TABLE", dateFrom: "yesterday", dateTo: "2026-13-45" }), {});
  assert.deepEqual(parsePaymentFilters(new URLSearchParams("q=%20olive%20&dateFrom=2026-09-25")), { q: "olive", dateFrom: "2026-09-25" });
});

test("dates are Dubai calendar days, end-exclusive", () => {
  const { gte, lt } = dateBounds({ dateFrom: "2026-09-25", dateTo: "2026-09-25" });
  assert.equal(gte!.toISOString(), "2026-09-24T20:00:00.000Z");
  assert.equal(lt!.toISOString(), "2026-09-25T20:00:00.000Z");
  assert.equal(matchesPaymentFilters(base, { dateFrom: "2026-09-25", dateTo: "2026-09-25" }), true);
  assert.equal(matchesPaymentFilters(base, { dateTo: "2026-09-24" }), false);
});

test("status filters", () => {
  assert.equal(matchesPaymentFilters(base, { status: "PAID" }), true);
  assert.equal(matchesPaymentFilters({ ...base, status: "AUTHORIZED" }, { status: "IN_PROGRESS" }), true);
  assert.equal(matchesPaymentFilters({ ...base, status: "CREATED" }, { status: "IN_PROGRESS" }), true);
  assert.equal(matchesPaymentFilters(base, { status: "REFUNDED" }), false);
  assert.equal(matchesPaymentFilters({ ...base, refundedAedFils: 100 }, { status: "REFUNDED" }), true);
  assert.equal(matchesPaymentFilters({ ...base, needsAttention: "x" }, { status: "ATTENTION" }), true);
  assert.equal(matchesPaymentFilters({ ...base, status: "CANCELLED" }, { status: "FAILED" }), false);
});

test("search covers business, contact, email, receipt and reference", () => {
  for (const q of ["olive", "SARA", "example.com", "0042", "bank-991"]) assert.equal(matchesPaymentFilters(base, { q }), true, q);
  assert.equal(matchesPaymentFilters(base, { q: "nomatch" }), false);
});

test("where clause and query string round-trip", () => {
  assert.deepEqual(paymentWhere({}), {});
  assert.deepEqual(paymentWhere({ status: "ATTENTION" }), { AND: [{ needsAttention: { not: null } }] });
  const f = { q: "olive", status: "PAID" as const, eventId: "e1", dateFrom: "2026-09-01" };
  assert.deepEqual(parsePaymentFilters(paymentFiltersToQuery(f)), f);
});
