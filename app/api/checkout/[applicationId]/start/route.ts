import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";
import { getPriceForSizeAtEvent } from "@/lib/pricing";
import { getGateway } from "@/payments/gateway";
import { BOOTH_PAYMENT_HOLD_MINUTES } from "@/lib/constants";

// Moves a booth from its 5-minute review hold into a fresh 5-minute payment
// hold, and opens a charge with the (sandbox) payment gateway.
export async function POST(req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { applicationId } = await params;
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application || application.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await runExpiryPass(application.eventId);

  const freshApp = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (freshApp.status !== "ACCEPTED" || !freshApp.acceptanceExpiresAt || freshApp.acceptanceExpiresAt < new Date()) {
    return NextResponse.json({ error: "Your acceptance is not currently active." }, { status: 403 });
  }

  const booth = await prisma.booth.findFirst({
    where: { heldByApplicationId: applicationId, status: "HELD" },
  });
  if (!booth) {
    return NextResponse.json({ error: "No active booth hold — please select a booth first." }, { status: 409 });
  }

  const price = await getPriceForSizeAtEvent(application.eventId, booth.size);
  if (price == null) {
    return NextResponse.json({ error: "Pricing is not configured for this booth size." }, { status: 500 });
  }

  const holdExpiresAt = new Date(Date.now() + BOOTH_PAYMENT_HOLD_MINUTES * 60 * 1000);
  await prisma.booth.update({
    where: { id: booth.id },
    data: { holdStage: "PAYMENT", holdExpiresAt },
  });

  const gateway = getGateway();
  const charge = await gateway.createCharge({
    amountAedFils: price,
    currency: "AED",
    applicationId,
    boothId: booth.id,
    eventId: application.eventId,
    vendorEmail: application.email,
    description: `Booth ${booth.code} — ${application.eventId}`,
  });

  const payment = await prisma.payment.create({
    data: {
      applicationId,
      eventId: application.eventId,
      boothId: booth.id,
      amountAedFils: price,
      currency: "AED",
      status: "PENDING",
      provider: gateway.name,
      providerRef: charge.providerRef,
    },
  });

  return NextResponse.json({
    paymentId: payment.id,
    providerRef: charge.providerRef,
    amountAedFils: price,
    boothCode: booth.code,
    holdExpiresAt: holdExpiresAt.toISOString(),
  });
}
