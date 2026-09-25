import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";
import { getBoothPrice } from "@/lib/pricing";
import { getGateway } from "@/payments/gateway";
import { BOOTH_PAYMENT_HOLD_MINUTES } from "@/lib/constants";
import { hasAcceptedCurrentEventTerms } from "@/lib/agreements";
import { requirePhoneVerifiedVendor } from "@/lib/verification";
import { logPaymentEvent } from "@/lib/bookingPayment";
import { ONLINE_PAYMENT_UNAVAILABLE, onlinePaymentMode } from "@/lib/paymentMode";

// Moves a booth from its 5-minute review hold into a fresh 5-minute payment
// hold, and opens a charge with the (sandbox) payment gateway.
export async function POST(req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const gate = await requirePhoneVerifiedVendor(session.vendorId);
  if (!gate.ok) return gate.response;

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

  const booths = await prisma.booth.findMany({
    where: { heldByApplicationId: applicationId, status: "HELD" },
  });
  if (booths.length === 0) {
    return NextResponse.json({ error: "No active booth hold — please select a booth first." }, { status: 409 });
  }

  // The one rule that must never have a bypass: no route to payment exists
  // without accepting THIS event's current Terms & Conditions, even if the
  // client skips the UI and calls this endpoint directly. One acceptance
  // covers the whole booking regardless of how many booths it has.
  const acceptedCurrentTerms = await hasAcceptedCurrentEventTerms(session.vendorId, applicationId, application.eventId);
  if (!acceptedCurrentTerms) {
    return NextResponse.json(
      { error: "You must review and accept this event's Terms & Conditions before continuing to payment." },
      { status: 403 }
    );
  }

  // Production without a live gateway: stop here, before any charge or
  // stage change. The booths stay in their REVIEW hold (which lasts until
  // the acceptance deadline) and DAH records the payment from the admin
  // application page. See lib/paymentMode.ts.
  if (onlinePaymentMode() === "DISABLED") {
    return NextResponse.json(
      {
        error: "Online payment isn't available yet. Your booth is reserved — DAH will contact you to arrange payment.",
        code: ONLINE_PAYMENT_UNAVAILABLE,
      },
      { status: 503 }
    );
  }

  // Price every held booth server-side — never trust a client-supplied
  // total. One combined charge covers the whole set.
  const priced: { boothId: string; code: string; priceAedFils: number }[] = [];
  for (const booth of booths) {
    const price = await getBoothPrice(booth, application.eventId);
    if (price == null) {
      return NextResponse.json({ error: "Pricing is not configured for this booth." }, { status: 500 });
    }
    priced.push({ boothId: booth.id, code: booth.code, priceAedFils: price });
  }
  const totalAedFils = priced.reduce((sum, p) => sum + p.priceAedFils, 0);

  const gateway = getGateway();
  const boothCodes = priced.map((p) => p.code).join(" + ");
  // The gateway call is external I/O and must never happen inside a DB
  // transaction (it would hold a connection open for the network round
  // trip) — so it runs first, standalone. The REVIEW->PAYMENT stage
  // transition and the Payment row that records the resulting charge are
  // then written together in one transaction: previously these were two
  // separate writes, so a crash between them could leave a booth stuck in
  // holdStage "PAYMENT" with no corresponding Payment row (harmless — it
  // just sits until the 5-minute hold expires and releases — but not
  // atomic). The updateMany's WHERE re-asserts the exact state this route
  // already confirmed (HELD + still held by this application), the same
  // race-safe guard pattern used everywhere else a booth's stage changes;
  // a mismatched count rolls back the whole transaction rather than
  // silently proceeding with a stale set of booths.
  const holdExpiresAt = new Date(Date.now() + BOOTH_PAYMENT_HOLD_MINUTES * 60 * 1000);
  const charge = await gateway.createCharge({
    amountAedFils: totalAedFils,
    currency: "AED",
    applicationId,
    boothId: priced[0].boothId, // representative booth for the single-booth-shaped gateway metadata — the real per-booth breakdown lives in PaymentBooth
    eventId: application.eventId,
    vendorEmail: application.email,
    description: `Booth ${boothCodes} — ${application.eventId}`,
  });

  const boothIds = booths.map((b) => b.id);
  const payment = await prisma.$transaction(async (tx) => {
    const staged = await tx.booth.updateMany({
      where: { id: { in: boothIds }, heldByApplicationId: applicationId, status: "HELD", holdStage: "REVIEW" },
      data: { holdStage: "PAYMENT", holdExpiresAt },
    });
    if (staged.count !== boothIds.length) {
      throw new Error("BOOTH_HOLD_CHANGED");
    }
    const created = await tx.payment.create({
      data: {
        applicationId,
        eventId: application.eventId,
        boothId: priced[0].boothId,
        amountAedFils: totalAedFils,
        currency: "AED",
        status: "PENDING",
        provider: gateway.name,
        providerRef: charge.providerRef,
        booths: {
          create: priced.map((p) => ({ boothId: p.boothId, priceAedFilsAtCharge: p.priceAedFils })),
        },
      },
    });
    await logPaymentEvent(tx, {
      paymentId: created.id,
      applicationId,
      type: "CREATED",
      actor: "VENDOR",
      detail: { provider: gateway.name, amountAedFils: totalAedFils, boothCodes: priced.map((p) => p.code) },
    });
    return created;
  }).catch((err) => {
    if (err instanceof Error && err.message === "BOOTH_HOLD_CHANGED") return null;
    throw err;
  });

  if (!payment) {
    return NextResponse.json({ error: "Your booth hold changed — please select a booth again." }, { status: 409 });
  }

  return NextResponse.json({
    paymentId: payment.id,
    providerRef: charge.providerRef,
    amountAedFils: totalAedFils,
    boothCode: boothCodes,
    holdExpiresAt: holdExpiresAt.toISOString(),
  });
}
