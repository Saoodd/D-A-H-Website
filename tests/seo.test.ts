import { test } from "node:test";
import assert from "node:assert/strict";
import { eventJsonLd, jsonLd, isIndexableDeployment } from "../lib/seo";

test("JSON-LD can't be broken out of by admin-authored text", () => {
  const out = jsonLd({ "@type": "Event", name: "</script><script>alert(1)</script>" });
  assert.equal(out.includes("</script>"), false);
  assert.equal(JSON.parse(out).name, "</script><script>alert(1)</script>");
});

test("event markup reflects cancellation and omits empty fields", () => {
  const base = { slug: "s", name: "N", description: "", startDate: new Date("2026-10-09T11:00:00Z"), endDate: null, location: "Dubai", coverImage: null };
  const live = eventJsonLd({ ...base, status: "PUBLISHED" });
  assert.equal(live.eventStatus, "https://schema.org/EventScheduled");
  assert.equal("description" in live, false);
  assert.equal("endDate" in live, false);
  assert.equal(eventJsonLd({ ...base, status: "CANCELLED" }).eventStatus, "https://schema.org/EventCancelled");
});

test("only production deployments are indexable", () => {
  const saved = { VERCEL_ENV: process.env.VERCEL_ENV, NODE_ENV: process.env.NODE_ENV };
  const env = process.env as Record<string, string | undefined>;
  try {
    env.VERCEL_ENV = "preview";
    assert.equal(isIndexableDeployment(), false);
    env.VERCEL_ENV = "production";
    assert.equal(isIndexableDeployment(), true);
  } finally {
    env.VERCEL_ENV = saved.VERCEL_ENV;
    env.NODE_ENV = saved.NODE_ENV;
  }
});
