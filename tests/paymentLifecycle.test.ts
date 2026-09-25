import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, isTerminal, legalSourcesFor, lifecycleStatus } from "../lib/paymentLifecycle";

test("paid, failed and cancelled are final", () => {
  for (const s of ["SUCCEEDED", "FAILED", "CANCELLED"]) {
    assert.equal(isTerminal(s), true, s);
    for (const to of ["PENDING", "AUTHORIZED", "SUCCEEDED", "FAILED", "CANCELLED"] as const) {
      assert.equal(canTransition(s, to), false, `${s} -> ${to}`);
    }
  }
});

test("open states move forward only", () => {
  assert.equal(canTransition("CREATED", "PENDING"), true);
  assert.equal(canTransition("PENDING", "AUTHORIZED"), true);
  assert.equal(canTransition("AUTHORIZED", "SUCCEEDED"), true);
  assert.equal(canTransition("AUTHORIZED", "PENDING"), false);
  assert.equal(canTransition("PENDING", "CREATED"), false);
});

test("a payment can only become paid from an open state", () => {
  assert.deepEqual(legalSourcesFor("SUCCEEDED").sort(), ["AUTHORIZED", "PENDING"].sort());
});

test("refunds are derived from the refunded amount, never from status", () => {
  assert.equal(lifecycleStatus({ status: "SUCCEEDED", amountAedFils: 1000, refundedAedFils: 0 }), "PAID");
  assert.equal(lifecycleStatus({ status: "SUCCEEDED", amountAedFils: 1000, refundedAedFils: 400 }), "PARTIALLY_REFUNDED");
  assert.equal(lifecycleStatus({ status: "SUCCEEDED", amountAedFils: 1000, refundedAedFils: 1000 }), "REFUNDED");
  assert.equal(lifecycleStatus({ status: "FAILED", amountAedFils: 1000, refundedAedFils: 0 }), "FAILED");
});
