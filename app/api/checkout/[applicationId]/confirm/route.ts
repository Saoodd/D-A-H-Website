import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";
import { getGateway, getSandboxGateway } from "@/payments/gateway";
import { sendPaymentSuccessEmail, sendPaymentFailedEmail } from "@/lib/email";
import { assignReceiptNumber, getReceiptData } from "@/lib/receipts";
import { trustedSiteUrl } from "@/lib/url";
import { requirePhoneVerifiedVendor } from "@/lib/verification";
import { notifyVendorWhatsApp } from "@/lib/notifications/notify";
import { applicationUrl } from "@/lib/notifications/links";
import { formatAed } from "@/lib/constants";

// TODO: once a live gateway is wired in, this route's "outcome" input goes
// away — success/failure will instead be driven by that gateway's webhook
// (see payments/gateway.ts `handleWebhook`) rather than a client-chosen
// sandbox outcome.
export async function POST(req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const gate = await requirePhoneVerifiedVendor(session.vendorId);
  if (!gate.ok) return gate.response;

  const { applicationId } = await params;
  const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { event: true } });
  if (!application || application.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const paymentId = body.paymentId as string | undefined;
  const outcome = body.outcome as "SUCCEEDED" | "FAILED" | undefined;
  if (!paymentId || (outcome !== "SUCCEEDED" && outcome !== "FAILED")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await runExpiryPass(application.eventId);

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.applicationId !== applicationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (payment.status !== "PENDING") {
    return NextResponse.json({ error: "This payment has already been resolved." }, { status: 409 });
  }

  const paymentBooths = await prisma.paymentBooth.findMany({ where: { paymentId }, include: { booth: true } });
  const booths = paymentBooths.map((pb) => pb.booth);
  const allStillValid = booths.every(
    (booth) => booth.heldByApplicationId === applicationId && booth.holdStage === "PAYMENT" && booth.holdExpiresAt && booth.holdExpiresAt > new Date()
  );
  if (booths.length === 0 || !allStillValid) {
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } });
    return NextResponse.json(
      { error: "Your payment session expired. Please select a booth again." },
      { status: 409 }
    );
  }

  const gateway = getGateway();
  if (gateway.name === "sandbox") {
    getSandboxGateway().simulateOutcome(payment.providerRef!, outcome);
  }

  if (outcome === "SUCCEEDED") {
    const soldAt = new Date();
    const boothIds = booths.map((b) => b.id);
    // Every write that makes up "this booking is genuinely confirmed" —
    // booths SOLD, their sale-price snapshot, the payment itself marked
    // SUCCEEDED, the now-irrelevant acceptance deadline cleared, and the
    // receipt number assigned — happens in ONE transaction. Previously
    // these were five sequential top-level writes; a crash partway through
    // (e.g. after booths were marked SOLD but before Payment flipped to
    // SUCCEEDED) could leave a booth permanently unavailable to everyone
    // else while its own payment still read PENDING — exactly the kind of
    // desync this booking system's other invariants (getDisplayStatus,
    // expireStaleAcceptances) assume can never happen. Same TOCTOU guard as
    // before: the updateMany's WHERE re-checks still-held-by-this-
    // application + PAYMENT stage, and `sale.count === boothIds.length`
    // keeps a multi-booth sale all-or-nothing — a mismatch throws to roll
    // back the ENTIRE transaction (payment included), not just the booths.
    const txResult = await prisma
      .$transaction(async (tx) => {
        const sale = await tx.booth.updateMany({
          where: { id: { in: boothIds }, heldByApplicationId: applicationId, holdStage: "PAYMENT" },
          data: {
            status: "SOLD",
            assignedApplicationId: applicationId,
            heldByApplicationId: null,
            holdStage: null,
            holdExpiresAt: null,
            soldAt,
          },
        });
        if (sale.count !== boothIds.length) {
          throw new Error("BOOTH_HOLD_CHANGED");
        }
        // priceAedFilsAtSale is per-booth (unlike the shared soldAt/status
        // above) — set individually from each PaymentBooth's own charged price.
        await Promise.all(
          paymentBooths.map((pb) => tx.booth.update({ where: { id: pb.boothId }, data: { priceAedFilsAtSale: pb.priceAedFilsAtCharge } }))
        );
        await tx.payment.update({ where: { id: paymentId }, data: { status: "SUCCEEDED", paidAt: soldAt } });
        // The acceptance deadline's only job was to force a timely payment —
        // now that payment has genuinely succeeded, clear it so this booking
        // can never later be caught and flipped to ACCEPTANCE_EXPIRED by
        // lib/expiry.ts's sweep just because wall-clock time passed the
        // original (now irrelevant) deadline. application.status itself stays
        // "ACCEPTED" — there is no separate "CONFIRMED" status; getDisplayStatus()
        // already derives "PAID" from ACCEPTED + a succeeded payment.
        await tx.application.update({ where: { id: applicationId }, data: { acceptanceExpiresAt: null } });
        const receiptNumber = await assignReceiptNumber(paymentId, soldAt, tx);
        return { receiptNumber };
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "BOOTH_HOLD_CHANGED") return null;
        throw err;
      });

    if (!txResult) {
      await prisma.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } });
      return NextResponse.json(
        { error: "Your payment session expired. Please select a booth again." },
        { status: 409 }
      );
    }

    // getReceiptData is the same authoritative source the vendor's own
    // printable receipt uses — the email can never show different numbers
    // than what the vendor sees when they click through.
    const receipt = await getReceiptData(paymentId);
    if (receipt) {
      await sendPaymentSuccessEmail({
        vendorId: session.vendorId,
        vendorEmail: application.email,
        businessName: application.businessName,
        eventId: application.eventId,
        eventName: application.event.name,
        eventStartDate: application.event.startDate,
        eventLocation: application.event.location,
        boothCode: receipt.boothCode,
        boothSizeLabel: receipt.boothSizeLabel,
        subtotalAedFils: receipt.subtotalAedFils,
        vatAedFils: receipt.vatAedFils,
        vatApplicable: receipt.vatApplicable,
        totalAedFils: receipt.totalAedFils,
        receiptNumber: receipt.receiptNumber,
        paidAt: soldAt,
        receiptUrl: `${trustedSiteUrl()}/vendor/receipts/${paymentId}`,
        viewBookingUrl: `${trustedSiteUrl()}/vendor/applications/${applicationId}`,
        dedupeKey: `payment_receipt:${paymentId}`,
      });

      const whatsAppData = {
        business_name: application.businessName,
        event_name: application.event.name,
        booth: receipt.boothCode,
        amount_paid: formatAed(receipt.totalAedFils),
        booking_url: applicationUrl(applicationId),
      };
      await notifyVendorWhatsApp({
        useCase: "PAYMENT_RECEIVED",
        vendorId: session.vendorId,
        eventId: application.eventId,
        applicationId,
        paymentId,
        data: whatsAppData,
      });
      await notifyVendorWhatsApp({
        useCase: "BOOKING_CONFIRMED",
        vendorId: session.vendorId,
        eventId: application.eventId,
        applicationId,
        paymentId,
        data: whatsAppData,
      });
    }

    return NextResponse.json({ ok: true, status: "SUCCEEDED" });
  }

  await prisma.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } });

  await sendPaymentFailedEmail({
    vendorId: session.vendorId,
    vendorEmail: application.email,
    businessName: application.businessName,
    eventName: application.event.name,
    retryUrl: `${trustedSiteUrl()}/vendor/applications/${applicationId}`,
  });

  return NextResponse.json({ ok: true, status: "FAILED" });
}
