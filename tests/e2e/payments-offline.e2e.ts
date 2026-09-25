// Online-payment availability + admin offline payments.
//   E2E_PAYMENT_MODE=disabled  production build without a live provider:
//                              online checkout is refused, booths stay held
//   E2E_PAYMENT_MODE=sandbox   dev server (or ALLOW_SANDBOX_PAYMENTS=true)
// In both modes: recording an offline payment, its validation, receipt,
// audit trail, refunds, and superseding a pending online payment.
import { getBoothPrice } from "../../lib/pricing";
import { adminLogin, BASE, check, cleanup, finish, makeAcceptedApplication, makeEvent, makeVendor, page, post, prisma, vendorLogin, get, setup } from "./_lib";

const MODE = (process.env.E2E_PAYMENT_MODE ?? "disabled") as "disabled" | "sandbox";

async function main() {
  await setup();
  const { event, booths } = await makeEvent(3);
  const vendors = await Promise.all([1, 2, 3].map(() => makeVendor({ verified: true, tag: "pm" })));
  try {
    const apps = await Promise.all(vendors.map((v) => makeAcceptedApplication(v, event.id)));
    const vc = await Promise.all(vendors.map((v) => vendorLogin(v.username)));
    const ac = await adminLogin();

    for (let i = 0; i < 3; i++) {
      const hold = await post(`/api/applications/${apps[i].id}/booths/hold`, vc[i], { boothIds: [booths[i].id] });
      check(`vendor ${i + 1} holds a booth`, hold.status === 200, hold);
      const terms = await post(`/api/applications/${apps[i].id}/event-terms`, vc[i], { representativeName: "E2E Tester" });
      // 404: this fixture event has no published Event Terms, so none are required.
      check(`vendor ${i + 1} terms step`, terms.status === 200 || terms.status === 404, terms);
    }

    // --- Vendor 1: online checkout ------------------------------------------
    const start1 = await post(`/api/checkout/${apps[0].id}/start`, vc[0]);
    if (MODE === "disabled") {
      check("online checkout refused (503 ONLINE_PAYMENT_UNAVAILABLE)", start1.status === 503 && start1.json.code === "ONLINE_PAYMENT_UNAVAILABLE", start1);
      const b = await prisma.booth.findUnique({ where: { id: booths[0].id } });
      check("booth stays in REVIEW hold", b?.status === "HELD" && b?.holdStage === "REVIEW" && b?.heldByApplicationId === apps[0].id, b);
      check("no payment row created", (await prisma.payment.count({ where: { applicationId: apps[0].id } })) === 0);
      const conf = await post(`/api/checkout/${apps[0].id}/confirm`, vc[0], { paymentId: "x", outcome: "SUCCEEDED" });
      check("browser 'confirm' refused (503)", conf.status === 503, conf);
    } else {
      check("sandbox: start 200", start1.status === 200, start1);
      const conf = await post(`/api/checkout/${apps[0].id}/confirm`, vc[0], { paymentId: start1.json.paymentId, outcome: "SUCCEEDED" });
      check("sandbox: confirm 200", conf.status === 200, conf);
      const p = await prisma.payment.findUnique({ where: { id: start1.json.paymentId } });
      check("sandbox: payment SUCCEEDED with receipt", p?.status === "SUCCEEDED" && !!p?.receiptNumber, p);
      const replay = await post(`/api/checkout/${apps[0].id}/confirm`, vc[0], { paymentId: start1.json.paymentId, outcome: "SUCCEEDED" });
      check("sandbox: replayed confirm 409", replay.status === 409, replay);
    }

    // --- Vendor 2: offline payment from a REVIEW hold ------------------------
    const url2 = `/api/admin/applications/${apps[1].id}/offline-payment`;
    check("offline: vendor cookie -> 401", (await post(url2, vc[1], { method: "CASH", reference: "x", expectedAmountAedFils: 100 })).status === 401);
    check("offline: blank reference -> 400", (await post(url2, ac, { method: "CASH", reference: "  ", expectedAmountAedFils: 100 })).status === 400);
    check("offline: unknown method -> 400", (await post(url2, ac, { method: "CRYPTO", reference: "r", expectedAmountAedFils: 100 })).status === 400);
    const wrongAmt = await post(url2, ac, { method: "BANK_TRANSFER", reference: "FT-1", expectedAmountAedFils: 1 });
    check("offline: amount that doesn't match the server quote -> 409", wrongAmt.status === 409, wrongAmt);
    check("offline: rejected attempts wrote nothing", (await prisma.payment.count({ where: { applicationId: apps[1].id } })) === 0);

    const price2 = await getBoothPrice(booths[1], event.id);
    const ok2 = await post(url2, ac, { method: "BANK_TRANSFER", reference: "FT-12345", note: "internal", expectedAmountAedFils: price2 });
    check("offline: recorded with a receipt number", ok2.status === 200 && typeof ok2.json.receiptNumber === "string", ok2);
    const p2 = await prisma.payment.findUnique({ where: { id: ok2.json.paymentId }, include: { booths: true } });
    check(
      "offline: payment row is correct",
      p2?.status === "SUCCEEDED" && p2.provider === "offline" && p2.method === "BANK_TRANSFER" && p2.providerRef === "FT-12345" && p2.note === "internal" && p2.amountAedFils === price2 && p2.booths.length === 1 && !!p2.paidAt,
      p2,
    );
    const b2 = await prisma.booth.findUnique({ where: { id: booths[1].id } });
    check("offline: booth SOLD with price snapshot", b2?.status === "SOLD" && b2.assignedApplicationId === apps[1].id && b2.priceAedFilsAtSale === price2 && b2.heldByApplicationId === null, b2);
    const a2 = await prisma.application.findUnique({ where: { id: apps[1].id } });
    check("offline: acceptance deadline cleared", a2?.acceptanceExpiresAt === null, a2);
    const ev2 = await prisma.paymentEvent.findMany({ where: { applicationId: apps[1].id } });
    check("offline: audit OFFLINE_RECORDED by ADMIN", ev2.length === 1 && ev2[0].type === "OFFLINE_RECORDED" && ev2[0].actor === "ADMIN", ev2);
    const replay2 = await post(url2, ac, { method: "BANK_TRANSFER", reference: "FT-12345", expectedAmountAedFils: price2 });
    check("offline: recording again -> 409 already paid", replay2.status === 409, replay2);
    check("refund via provider refused for an offline payment", (await post(`/api/admin/payments/${ok2.json.paymentId}/refund`, ac, { amountAedFils: 100, method: "ORIGINAL_METHOD", reason: "should be refused" })).status === 400);
    const hand = await post(`/api/admin/payments/${ok2.json.paymentId}/refund`, ac, { amountAedFils: 100, method: "BANK_TRANSFER", reason: "hand refund ok" });
    check("hand-recorded refund on an offline payment", hand.status === 200 && hand.json.refundedAedFils === 100, hand);

    const status2 = await get(`/api/applications/${apps[1].id}/status`, vc[1]);
    check("vendor sees the booking as PAID", status2.json.displayStatus === "PAID", status2.json.displayStatus);
    const receipt = await page(`/vendor/receipts/${ok2.json.paymentId}`, vc[1]);
    check("receipt shows Bank Transfer and hides the internal note", receipt.includes("Bank Transfer") && !receipt.includes("internal<"));

    // --- Vendor 3: offline payment supersedes a pending online one (sandbox)
    const price3 = await getBoothPrice(booths[2], event.id);
    let pending3: string | null = null;
    if (MODE === "sandbox") {
      const s3 = await post(`/api/checkout/${apps[2].id}/start`, vc[2]);
      check("supersede: online start 200", s3.status === 200, s3);
      pending3 = s3.json.paymentId;
    }
    const ok3 = await post(`/api/admin/applications/${apps[2].id}/offline-payment`, ac, { method: "CARD_POS", reference: "POS-9", expectedAmountAedFils: price3 });
    check("second offline payment recorded", ok3.status === 200, ok3);
    if (pending3) {
      check("supersede: old pending payment -> FAILED", (await prisma.payment.findUnique({ where: { id: pending3 } }))?.status === "FAILED");
      check("supersede: late confirm of the old payment -> 409", (await post(`/api/checkout/${apps[2].id}/confirm`, vc[2], { paymentId: pending3, outcome: "SUCCEEDED" })).status === 409);
    }
    check("receipt numbers are distinct", ok3.json.receiptNumber !== ok2.json.receiptNumber);
  } finally {
    await cleanup({ eventIds: [event.id], vendorIds: vendors.map((v) => v.id) });
    await finish(`payments-offline (${MODE} @ ${BASE})`);
  }
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
