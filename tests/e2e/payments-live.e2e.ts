// The LIVE payment path, exercised through the dev-only `local-test`
// gateway (redirect -> return page -> signed webhook / status
// reconciliation -> refunds). Needs a NON-production server started with
// PAYMENT_PROVIDER=local-test and LOCAL_TEST_PAYMENTS_SECRET (scripts/e2e.mjs
// does this). Moves no money and talks to no bank.
import { createHmac } from "node:crypto";
import { adminLogin, BASE, check, cleanup, finish, get, makeAcceptedApplication, makeEvent, makeVendor, page, post, prisma, vendorLogin, setup } from "./_lib";

const SECRET = process.env.LOCAL_TEST_PAYMENTS_SECRET ?? "";
const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex")}`;
async function webhook(evt: Record<string, unknown>, sig?: string) {
  const body = JSON.stringify(evt);
  const r = await fetch(`${BASE}/api/webhooks/payments/local-test`, { method: "POST", headers: { "content-type": "application/json", "x-local-test-signature": sig ?? sign(body) }, body });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}
let evtSeq = 0;
const evtId = (label: string) => `evt_${Date.now()}_${label}_${evtSeq++}`;

async function main() {
  await setup();
  if (!SECRET) throw new Error("LOCAL_TEST_PAYMENTS_SECRET must be set to the server's value");
  const { event, booths } = await makeEvent(5);
  const vendors = await Promise.all([0, 1, 2, 3, 4].map(() => makeVendor({ verified: true, tag: "lv" })));
  try {
    const apps = await Promise.all(vendors.map((v) => makeAcceptedApplication(v, event.id)));
    const cookies = await Promise.all(vendors.map((v) => vendorLogin(v.username)));
    for (let i = 0; i < 5; i++) {
      const hold = await post(`/api/applications/${apps[i].id}/booths/hold`, cookies[i], { boothIds: [booths[i].id] });
      if (hold.status !== 200) throw new Error(`hold ${i} failed: ${JSON.stringify(hold)}`);
    }
    const start = (i: number) => post(`/api/checkout/${apps[i].id}/start`, cookies[i]);
    const boothStatus = async (i: number) => (await prisma.booth.findUnique({ where: { id: booths[i].id } }))?.status;

    // Start: redirect to the provider, PENDING with a provider reference.
    const s0 = await start(0);
    const p0 = (await prisma.payment.findUnique({ where: { id: s0.json.paymentId } }))!;
    check("start returns a redirect ending at DAH's return page", s0.status === 200 && String(s0.json.redirectUrl).endsWith(`/vendor/payments/return/${p0.id}`), s0);
    check("payment PENDING with a provider reference", p0.status === "PENDING" && p0.provider === "local-test" && !!p0.providerRef?.startsWith("lt_"), p0);
    check("the browser can't mark it paid (sandbox confirm refused, 503)", (await post(`/api/checkout/${apps[0].id}/confirm`, cookies[0], { paymentId: p0.id, outcome: "SUCCEEDED" })).status === 503);

    // Webhook authenticity.
    const good = { id: evtId("paid"), providerRef: p0.providerRef, state: "PAID", amountAedFils: p0.amountAedFils, currency: "AED" };
    check("bad signature -> 400", (await webhook(good, "t=1,v1=deadbeef")).status === 400);
    check("stale timestamp (10 min) -> 400", (await webhook(good, sign(JSON.stringify(good), Math.floor(Date.now() / 1000) - 600))).status === 400);
    check("unknown provider path -> 404", (await fetch(`${BASE}/api/webhooks/payments/sandbox`, { method: "POST", body: "{}" })).status === 404);
    check("nothing applied after rejected webhooks", (await prisma.payment.findUnique({ where: { id: p0.id } }))?.status === "PENDING");

    // Amount mismatch is never treated as paid.
    const mm = await webhook({ ...good, id: evtId("mm"), amountAedFils: 1 });
    const p0m = await prisma.payment.findUnique({ where: { id: p0.id } });
    check("amount mismatch -> not paid, flagged for attention", mm.json.outcome === "AMOUNT_MISMATCH" && p0m?.status === "PENDING" && !!p0m?.needsAttention, { mm, p0m });
    const ac = await adminLogin();
    const clr = await post(`/api/admin/payments/${p0.id}/clear-attention`, ac, { note: "test mismatch reviewed" });
    check("admin clears the attention flag with a note", clr.status === 200 && !(await prisma.payment.findUnique({ where: { id: p0.id } }))?.needsAttention, clr);

    // A correct PAID webhook finalises the booking, exactly once.
    const ok = await webhook(good);
    const p0p = await prisma.payment.findUnique({ where: { id: p0.id } });
    check("valid PAID webhook applied", ok.status === 200 && ok.json.outcome === "APPLIED", ok);
    check("payment SUCCEEDED with receipt, booth SOLD", p0p?.status === "SUCCEEDED" && !!p0p.receiptNumber && (await boothStatus(0)) === "SOLD", p0p);
    const dup = await webhook(good);
    check("redelivered event is a no-op", dup.json.duplicate === true && (await prisma.paymentEvent.count({ where: { paymentId: p0.id, type: "SUCCEEDED" } })) === 1, dup);
    check("new event for an already-paid payment -> ALREADY_APPLIED", (await webhook({ ...good, id: evtId("again") })).json.outcome === "ALREADY_APPLIED");
    check("webhook event stored once", (await prisma.paymentWebhookEvent.count({ where: { providerEventId: good.id } })) === 1);

    // Vendor views.
    check("vendor status API shows PAID", (await get(`/api/payments/${p0.id}/status`, cookies[0])).json.lifecycle === "PAID");
    check("another vendor gets 404 for this payment", (await get(`/api/payments/${p0.id}/status`, cookies[1])).status === 404);
    check("return page says confirmed", (await page(`/vendor/payments/return/${p0.id}`, cookies[0])).includes("Your booking is confirmed"));

    // Reconciliation by server-to-server status check (no webhook).
    const s1 = await start(1);
    const p1 = (await prisma.payment.findUnique({ where: { id: s1.json.paymentId } }))!;
    await post("/api/dev/local-test-payments", null, { providerRef: p1.providerRef, state: "PAID", amountAedFils: p1.amountAedFils });
    const st1 = await get(`/api/payments/${p1.id}/status`, cookies[1]);
    check("status poll reconciles PAID without a webhook", st1.json.lifecycle === "PAID" && (await boothStatus(1)) === "SOLD", st1);

    // FAILED, then a late PAID: flagged, never auto-sold.
    const s2 = await start(2);
    const p2 = (await prisma.payment.findUnique({ where: { id: s2.json.paymentId } }))!;
    const f = await webhook({ id: evtId("f"), providerRef: p2.providerRef, state: "FAILED", amountAedFils: p2.amountAedFils, currency: "AED" });
    check("FAILED webhook applied", f.json.outcome === "APPLIED" && (await prisma.payment.findUnique({ where: { id: p2.id } }))?.status === "FAILED", f);
    const late = await webhook({ id: evtId("late"), providerRef: p2.providerRef, state: "PAID", amountAedFils: p2.amountAedFils, currency: "AED" });
    const p2l = await prisma.payment.findUnique({ where: { id: p2.id } });
    check("late PAID after FAILED -> needs attention, booth not sold", late.json.outcome === "NEEDS_ATTENTION" && p2l?.status === "FAILED" && !!p2l.needsAttention && (await boothStatus(2)) !== "SOLD", { late, p2l });

    // PAID after the hold changed underneath: flagged, booth untouched.
    const s3 = await start(3);
    const p3 = (await prisma.payment.findUnique({ where: { id: s3.json.paymentId } }))!;
    await prisma.booth.update({ where: { id: booths[3].id }, data: { holdStage: "REVIEW" } });
    const lost = await webhook({ id: evtId("lost"), providerRef: p3.providerRef, state: "PAID", amountAedFils: p3.amountAedFils, currency: "AED" });
    const p3l = await prisma.payment.findUnique({ where: { id: p3.id } });
    check("PAID after the hold changed -> needs attention, booth not sold", lost.json.outcome === "NEEDS_ATTENTION" && p3l?.status === "PENDING" && !!p3l.needsAttention && (await boothStatus(3)) === "HELD", { lost, p3l });

    // AUTHORIZED, then captured.
    const s4 = await start(4);
    const p4 = (await prisma.payment.findUnique({ where: { id: s4.json.paymentId } }))!;
    const au = await webhook({ id: evtId("au"), providerRef: p4.providerRef, state: "AUTHORIZED", amountAedFils: p4.amountAedFils, currency: "AED" });
    check("AUTHORIZED applied", au.json.outcome === "APPLIED" && (await prisma.payment.findUnique({ where: { id: p4.id } }))?.status === "AUTHORIZED", au);
    const cap = await webhook({ id: evtId("cap"), providerRef: p4.providerRef, state: "PAID", amountAedFils: p4.amountAedFils, currency: "AED" });
    check("AUTHORIZED -> PAID finalises", cap.json.outcome === "APPLIED" && (await prisma.payment.findUnique({ where: { id: p4.id } }))?.status === "SUCCEEDED", cap);

    // Refunds.
    const amt = p0.amountAedFils;
    check("refund unauthenticated -> 401", (await post(`/api/admin/payments/${p0.id}/refund`, null, { amountAedFils: 100, method: "CASH", reason: "test" })).status === 401);
    const r1 = await post(`/api/admin/payments/${p0.id}/refund`, ac, { amountAedFils: 1000, method: "ORIGINAL_METHOD", reason: "goodwill partial" });
    check("partial refund through the provider", r1.status === 200 && r1.json.refundedAedFils === 1000, r1);
    check("over-refund refused (409)", (await post(`/api/admin/payments/${p0.id}/refund`, ac, { amountAedFils: amt, method: "CASH", reason: "too much" })).status === 409);
    const r3 = await post(`/api/admin/payments/${p0.id}/refund`, ac, { amountAedFils: amt - 1000, method: "BANK_TRANSFER", reason: "rest refunded", reference: "FT-R1" });
    check("refund the remainder by bank transfer", r3.status === 200 && r3.json.refundedAedFils === amt, r3);
    const [c1, c2] = await Promise.all([
      post(`/api/admin/payments/${p0.id}/refund`, ac, { amountAedFils: 1, method: "CASH", reason: "race a" }),
      post(`/api/admin/payments/${p0.id}/refund`, ac, { amountAedFils: 1, method: "CASH", reason: "race b" }),
    ]);
    check("fully refunded: concurrent extra refunds both refused", c1.status === 409 && c2.status === 409, [c1.status, c2.status]);
    const appSt = await get(`/api/applications/${apps[0].id}/status`, cookies[0]);
    check("a refund doesn't unbook: still PAID, booth still SOLD", appSt.json.displayStatus === "PAID" && (await boothStatus(0)) === "SOLD", appSt.json.displayStatus);
    check("vendor sees lifecycle REFUNDED", (await get(`/api/payments/${p0.id}/status`, cookies[0])).json.lifecycle === "REFUNDED");
    check("refund on an unpaid payment refused", (await post(`/api/admin/payments/${p3.id}/refund`, ac, { amountAedFils: 100, method: "CASH", reason: "nope" })).status === 409);
    const events0 = await prisma.paymentEvent.findMany({ where: { paymentId: p0.id }, orderBy: { createdAt: "asc" } });
    check("full audit trail for the payment", events0.map((e) => e.type).join(",") === "CREATED,AMOUNT_MISMATCH,ATTENTION_CLEARED,SUCCEEDED,REFUNDED,REFUNDED", events0.map((e) => e.type));
  } finally {
    await prisma.paymentWebhookEvent.deleteMany({ where: { provider: "local-test" } });
    await cleanup({ eventIds: [event.id], vendorIds: vendors.map((v) => v.id) });
    await finish(`payments-live (local-test @ ${BASE})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
