import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDevice } from "../lib/device";
import { paymentMethodLabel } from "../lib/paymentLabels";
import { checkBoothFit } from "../lib/boothFit";
import { isValidUsernameFormat, normalizeUsername } from "../lib/username";
import { legalDocBySlug, isLegalDocType } from "../lib/legalDocs";

test("device labels", () => {
  assert.equal(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
  assert.equal(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"), "Chrome on Windows");
  assert.equal(describeDevice("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0"), "Edge on Windows");
  assert.equal(describeDevice(null), null);
});

test("payment method labels", () => {
  assert.equal(paymentMethodLabel({ provider: "offline", method: "BANK_TRANSFER" }), "Bank Transfer");
  assert.equal(paymentMethodLabel({ provider: "offline", method: "CASH" }, "ar"), "نقداً");
  assert.equal(paymentMethodLabel({ provider: "sandbox" }), "Card (Sandbox)");
});

test("booth fit, including rotation", () => {
  assert.deepEqual(checkBoothFit({ widthMm: 3000, depthMm: 2000 }, { widthMm: 3000, depthMm: 3000 }), { status: "FITS", rotated: false });
  assert.deepEqual(checkBoothFit({ widthMm: 3000, depthMm: 2000 }, { widthMm: 2000, depthMm: 3000 }), { status: "FITS", rotated: true });
  assert.deepEqual(checkBoothFit({ widthMm: 4000, depthMm: 2000 }, { widthMm: 3000, depthMm: 3000 }), { status: "DOES_NOT_FIT" });
  assert.deepEqual(checkBoothFit({ widthMm: null, depthMm: 2000 }, { widthMm: 3000, depthMm: 3000 }), { status: "UNKNOWN" });
});

test("usernames", () => {
  assert.equal(normalizeUsername("  Dar_Al_Hay "), "dar_al_hay");
  assert.equal(isValidUsernameFormat("ab"), false);
  assert.equal(isValidUsernameFormat("has space"), false);
  assert.equal(isValidUsernameFormat("dah_vendor1"), true);
});

test("legal doc slugs", () => {
  assert.equal(legalDocBySlug("refunds"), "REFUND_POLICY");
  assert.equal(legalDocBySlug("nope"), null);
  assert.equal(isLegalDocType("VENDOR_TERMS"), false);
});
