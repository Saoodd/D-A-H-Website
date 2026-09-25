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
import { trustedSiteUrl } from "@/lib/url";
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
  const holdExpiresAt = new Date(Date.now() + BOOTH_PAYMENT_HOLD_MINUTES * 60 * 1000);
  const boothIds = booths.map((b) => b.id);

  // Step 1 (one transaction): stage the booths REVIEW -> PAYMENT and create
  // the Payment row as CREATED. The row exists before the provider is
  // called, so the provider's return URL and metadata can carry its id.
  // The updateMany re-asserts the state checked above (HELD, held by this
  // application, REVIEW stage); a count mismatch rolls everything back.
  const payment = await prisma
    .$transaction(async (tx) => {
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
          status: "CREATED",
          provider: gateway.name,
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
    })
    .catch((err) => {
      if (err instanceof Error && err.message === "BOOTH_HOLD_CHANGED") return null;
      throw err;
    });

  if (!payment) {
    return NextResponse.json({ error: "Your booth hold changed — please select a booth again." }, { status: 409 });
  }

  // Step 2: open the charge with the provider. External I/O, so never
  // inside a transaction. On failure the payment is FAILED and the booths
  // go back to their review hold, so nothing is left stuck.
  let charge;
  try {
    charge = await gateway.createCharge({
      amountAedFils: totalAedFils,
      currency: "AED",
      applicationId,
      boothId: priced[0].boothId, // representative booth; the per-booth breakdown lives in PaymentBooth
      eventId: application.eventId,
      vendorEmail: application.email,
      description: `Booth ${boothCodes} — ${application.eventId}`,
      returnUrl: `${trustedSiteUrl()}/vendor/payments/return/${payment.id}`,
      cancelUrl: `${trustedSiteUrl()}/vendor/payments/return/${payment.id}?cancelled=1`,
    });
  } catch (err) {
    console.error("[checkout] provider createCharge failed:", err instanceof Error ? err.message : err);
    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({ where: { id: payment.id, status: "CREATED" }, data: { status: "FAILED" } });
      await logPaymentEvent(tx, { paymentId: payment.id, applicationId, type: "FAILED", actor: "SYSTEM", detail: { reason: "CREATE_CHARGE_FAILED" } });
      await tx.booth.updateMany({
        where: { id: { in: boothIds }, heldByApplicationId: applicationId, holdStage: "PAYMENT" },
        data: { holdStage: "REVIEW", holdExpiresAt: freshApp.acceptanceExpiresAt },
      });
    });
    return NextResponse.json({ error: "The payment provider couldn't be reached. Please try again in a moment." }, { status: 502 });
  }

  // Step 3: record the provider's reference. CREATED -> PENDING, guarded.
  await prisma.payment.updateMany({
    where: { id: payment.id, status: "CREATED" },
    data: { status: "PENDING", providerRef: charge.providerRef },
  });

  return NextResponse.json({
    paymentId: payment.id,
    providerRef: charge.providerRef,
    amountAedFils: totalAedFils,
    boothCode: boothCodes,
    holdExpiresAt: holdExpiresAt.toISOString(),
    // Redirect-style providers: the client sends the payer here.
    redirectUrl: charge.redirectUrl ?? null,
  });
}
