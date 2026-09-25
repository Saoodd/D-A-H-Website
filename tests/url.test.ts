import { test } from "node:test";
import assert from "node:assert/strict";
import { safeInternalPath, isValidHttpUrl } from "../lib/url";

const FALLBACK = "/vendor/dashboard";

test("keeps ordinary internal paths", () => {
  assert.equal(safeInternalPath("/vendor/applications/abc?tab=1#x", FALLBACK), "/vendor/applications/abc?tab=1#x");
});

test("rejects every open-redirect shape", () => {
  for (const bad of ["//evil.example", "/\\evil.example", "/%5Cevil.example".replace("%5C", "\\"), "https://evil.example", "evil.example", "javascript:alert(1)", "/\u0000x", "", null, undefined]) {
    assert.equal(safeInternalPath(bad as string, FALLBACK), FALLBACK, String(bad));
  }
});

test("isValidHttpUrl accepts only http(s)", () => {
  assert.equal(isValidHttpUrl("https://dah.example"), true);
  assert.equal(isValidHttpUrl("javascript:alert(1)"), false);
  assert.equal(isValidHttpUrl(""), false);
});
