// Admin legal CMS (Privacy / Website Terms / Refund policy): default text,
// draft -> publish -> versions, HTML sanitising, discard, and independence
// from the vendor signup terms.
//
// It needs a database with NO saved legal documents, and removes the ones it
// creates. If yours has real ones, it skips rather than touch them.
import { adminLogin, BASE, check, finish, page, prisma, setup } from "./_lib";

const TYPES = ["PRIVACY_POLICY", "WEBSITE_TERMS", "REFUND_POLICY"];

async function main() {
  await setup();
  if ((await prisma.agreement.count({ where: { type: { in: TYPES } } })) > 0) {
    console.log("[legal-cms] SKIPPED: this database already has legal documents; not touching them.");
    await prisma.$disconnect();
    return;
  }
  const ac = await adminLogin();
  const api = (path: string, method = "GET", body?: unknown, cookie: string | null = ac) =>
    fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({
      status: r.status,
      json: (await r.json().catch(() => ({}))) as Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any -- response shapes vary per endpoint
    }));
  try {
    check("default privacy text shown", (await page("/legal/privacy")).includes("Dar Al Hay (DAH) collects the information"));
    check("default terms text shown", (await page("/legal/terms")).includes("1. Application"));
    check("default refund text shown", (await page("/legal/refunds")).includes("Bookings are non-refundable"));
    check("admin API unauthenticated -> 401", (await api("/api/admin/agreements?type=PRIVACY_POLICY", "GET", undefined, null)).status === 401);
    check("unknown document type -> 400", (await api("/api/admin/agreements/draft", "POST", { type: "NOPE" })).status === 400);

    const d1 = await api("/api/admin/agreements/draft", "POST", { type: "PRIVACY_POLICY" });
    check("first draft starts from the default text, v1", d1.status === 200 && d1.json.draft.version === 1 && d1.json.draft.bodyHtml.includes("collects the information"), d1.status);
    const evil = `<p>Updated privacy text v1.</p><script>window.__pwned=1</script><img src=x onerror="alert(1)"><p><a href="javascript:alert(1)">bad link</a></p>`;
    check("save draft", (await api(`/api/admin/agreements/draft/${d1.json.draft.id}`, "PATCH", { title: "Privacy Policy", bodyHtml: evil })).status === 200);
    check("a draft isn't public", !(await page("/legal/privacy")).includes("Updated privacy text v1"));
    check("publish", (await api(`/api/admin/agreements/draft/${d1.json.draft.id}/publish`, "POST")).status === 200);
    const live = await page("/legal/privacy");
    check("published text is live with 'Last updated'", live.includes("Updated privacy text v1") && live.includes("Last updated"));
    check("script, event handlers and javascript: links are stripped", !live.includes("__pwned") && !live.includes("onerror") && !live.includes("javascript:alert"));

    const d2 = await api("/api/admin/agreements/draft", "POST", { type: "PRIVACY_POLICY" });
    check("next draft starts from the published text, v2", d2.json.draft.version === 2 && d2.json.draft.bodyHtml.includes("Updated privacy text v1"));
    await api(`/api/admin/agreements/draft/${d2.json.draft.id}`, "PATCH", { title: "Privacy Policy", bodyHtml: "<p>Privacy text v2.</p>" });
    await api(`/api/admin/agreements/draft/${d2.json.draft.id}/publish`, "POST");
    const state = await api("/api/admin/agreements?type=PRIVACY_POLICY");
    check("v2 published, v1 archived in history", state.json.published?.version === 2 && state.json.history.length === 2 && state.json.history.find((h: { version: number }) => h.version === 1)?.status === "ARCHIVED");
    check("v2 is live", (await page("/legal/privacy")).includes("Privacy text v2"));

    const d3 = await api("/api/admin/agreements/draft", "POST", { type: "WEBSITE_TERMS" });
    check("discarding a draft leaves the default page", (await api(`/api/admin/agreements/draft/${d3.json.draft.id}`, "DELETE")).status === 200 && (await page("/legal/terms")).includes("1. Application"));
    check("other documents unaffected", (await page("/legal/refunds")).includes("Bookings are non-refundable"));
    check("vendor signup terms are separate and unchanged", (await api("/api/admin/agreements?type=VENDOR_TERMS")).status === 200 && (await page("/vendor-terms")).includes("Terms"));
  } finally {
    await prisma.agreement.deleteMany({ where: { type: { in: TYPES } } });
    await finish(`legal-cms @ ${BASE}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
