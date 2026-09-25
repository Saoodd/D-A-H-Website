import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";
import { getGateway, getSandboxGateway } from "@/payments/gateway";
import { sendPaymentFailedEmail } from "@/lib/email";
import { trustedSiteUrl } from "@/lib/url";
import { requirePhoneVerifiedVendor } from "@/lib/verification";
import { BoothHoldChangedError, finalizeBoothSale, logPaymentEvent, sendBookingConfirmedNotifications } from "@/lib/bookingPayment";
import { ONLINE_PAYMENT_UNAVAILABLE, onlinePaymentMode } from "@/lib/paymentMode";

async function failPayment(paymentId: string, applicationId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const res = await tx.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "FAILED" } });
    if (res.count > 0) {
      await logPaymentEvent(tx, { paymentId, applicationId, type: "FAILED", actor: "VENDOR", detail: { reason } });
    }
  });
}

// SANDBOX ONLY. The client-chosen "outcome" below is exactly what makes
// this route unsafe for real money (SECURITY_AUDIT.md, C1), which is why
// it refuses to run when onlinePaymentMode() is DISABLED. A live gateway
// must NOT reuse this route: success has to come from the provider's
// verified webhook / server-side status check (payments/gateway.ts
// `handleWebhook` / `confirmPayment`), never from the browser.
export async function POST(req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const gate = await requirePhoneVerifiedVendor(session.vendorId);
  if (!gate.ok) return gate.response;

  // Checked before anything else: in DISABLED mode no client call may
  // resolve a payment, including one opened before the switch was made.
  if (onlinePaymentMode() !== "SANDBOX") {
    return NextResponse.json(
      { error: "Online payment isn't available yet. DAH will contact you to arrange payment.", code: ONLINE_PAYMENT_UNAVAILABLE },
      { status: 503 }
    );
  }

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
    await failPayment(paymentId, applicationId, "HOLD_EXPIRED");
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
    // One transaction for everything that makes the booking confirmed —
    // see lib/bookingPayment.ts finalizeBoothSale. A booth hold that changed
    // underneath us rolls the whole thing back, payment included.
    const paidAt = new Date();
    const txResult = await prisma
      .$transaction(async (tx) => {
        const result = await finalizeBoothSale(tx, {
          applicationId,
          paymentId,
          booths: paymentBooths.map((pb) => ({ boothId: pb.boothId, priceAedFils: pb.priceAedFilsAtCharge })),
          fromStages: ["PAYMENT"],
          paidAt,
        });
        await logPaymentEvent(tx, {
          paymentId,
          applicationId,
          type: "SUCCEEDED",
          actor: "VENDOR",
          detail: { provider: payment.provider, receiptNumber: result.receiptNumber },
        });
        return result;
      })
      .catch((err) => {
        if (err instanceof BoothHoldChangedError) return null;
        throw err;
      });

    if (!txResult) {
      await failPayment(paymentId, applicationId, "BOOTH_HOLD_CHANGED");
      return NextResponse.json(
        { error: "Your payment session expired. Please select a booth again." },
        { status: 409 }
      );
    }

    await sendBookingConfirmedNotifications(paymentId);
    return NextResponse.json({ ok: true, status: "SUCCEEDED" });
  }

  await failPayment(paymentId, applicationId, "VENDOR_REPORTED_FAILURE");

  await sendPaymentFailedEmail({
    vendorId: session.vendorId,
    vendorEmail: application.email,
    businessName: application.businessName,
    eventName: application.event.name,
    retryUrl: `${trustedSiteUrl()}/vendor/applications/${applicationId}`,
  });

  return NextResponse.json({ ok: true, status: "FAILED" });
}
