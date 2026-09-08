import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";
import { getGateway, getSandboxGateway } from "@/payments/gateway";
import { sendPaymentSuccessEmail, sendPaymentFailedEmail } from "@/lib/email";

// TODO: once a live gateway is wired in, this route's "outcome" input goes
// away — success/failure will instead be driven by that gateway's webhook
// (see payments/gateway.ts `handleWebhook`) rather than a client-chosen
// sandbox outcome.
export async function POST(req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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

  const booth = await prisma.booth.findUnique({ where: { id: payment.boothId } });
  if (
    !booth ||
    booth.heldByApplicationId !== applicationId ||
    booth.holdStage !== "PAYMENT" ||
    !booth.holdExpiresAt ||
    booth.holdExpiresAt < new Date()
  ) {
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
    // Same TOCTOU concern as the booth-hold route: guard the actual write
    // with the condition just re-checked above (still held by this
    // application, in the PAYMENT stage) so a double-submit or a race with
    // an expiry sweep can't sell the booth twice or out from under the hold.
    const sale = await prisma.booth.updateMany({
      where: { id: booth.id, heldByApplicationId: applicationId, holdStage: "PAYMENT" },
      data: {
        status: "SOLD",
        assignedApplicationId: applicationId,
        heldByApplicationId: null,
        holdStage: null,
        holdExpiresAt: null,
        priceAedFilsAtSale: payment.amountAedFils,
        soldAt,
      },
    });
    if (sale.count === 0) {
      await prisma.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } });
      return NextResponse.json(
        { error: "Your payment session expired. Please select a booth again." },
        { status: 409 }
      );
    }
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "SUCCEEDED", paidAt: soldAt } });

    await sendPaymentSuccessEmail({
      vendorEmail: application.email,
      businessName: application.businessName,
      eventName: application.event.name,
      boothCode: booth.code,
      amountAedFils: payment.amountAedFils,
      paidAt: soldAt,
    });

    return NextResponse.json({ ok: true, status: "SUCCEEDED" });
  }

  await prisma.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  await sendPaymentFailedEmail({
    vendorEmail: application.email,
    businessName: application.businessName,
    eventName: application.event.name,
    retryUrl: `${siteUrl}/vendor/applications/${applicationId}`,
  });

  return NextResponse.json({ ok: true, status: "FAILED" });
}
