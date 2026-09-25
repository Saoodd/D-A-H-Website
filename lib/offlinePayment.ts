import "server-only";
import { prisma } from "./prisma";
import { runExpiryPass } from "./expiry";
import { getBoothPrice } from "./pricing";
import { hasAcceptedCurrentEventTerms } from "./agreements";
import { BoothHoldChangedError, finalizeBoothSale, logPaymentEvent } from "./bookingPayment";
import type { OfflinePaymentMethod } from "./paymentLabels";

// Admin-recorded payments collected outside the website (bank transfer,
// cash, in-person card terminal). This is how DAH confirms bookings while
// no live online gateway is configured — see lib/paymentMode.ts.
//
// Same guarantees as an online payment: the amount is computed on the
// server from the booths' current prices (the admin confirms it, never
// types it), the vendor must have accepted the event's current Terms, and
// the sale runs through the same finalizeBoothSale transaction.

export type OfflinePaymentQuote =
  | { ok: true; booths: { boothId: string; code: string; priceAedFils: number }[]; totalAedFils: number }
  | { ok: false; reason: string };

/** Whether a payment can be recorded for this application right now, and
 *  for how much. Callers must run runExpiryPass first so an expired hold
 *  isn't quoted as still valid. */
export async function getOfflinePaymentQuote(applicationId: string): Promise<OfflinePaymentQuote> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { payments: { where: { status: "SUCCEEDED" }, select: { id: true } } },
  });
  if (!app) return { ok: false, reason: "Application not found." };
  if (app.payments.length > 0) return { ok: false, reason: "This booking is already paid." };
  if (app.status !== "ACCEPTED") return { ok: false, reason: "Only an accepted application can be paid." };

  const now = new Date();
  const booths = await prisma.booth.findMany({
    where: { heldByApplicationId: applicationId, status: "HELD", holdStage: { in: ["REVIEW", "PAYMENT"] } },
    orderBy: { code: "asc" },
  });
  if (booths.length === 0) {
    return { ok: false, reason: "The vendor hasn't reserved a booth yet. They need to choose one before a payment can be recorded." };
  }
  if (booths.some((b) => !b.holdExpiresAt || b.holdExpiresAt <= now)) {
    return { ok: false, reason: "The vendor's booth reservation has expired. Extend the acceptance and ask them to choose a booth again." };
  }

  if (!(await hasAcceptedCurrentEventTerms(app.vendorId, applicationId, app.eventId))) {
    return { ok: false, reason: "The vendor hasn't accepted this event's current Terms & Conditions yet." };
  }

  const priced: { boothId: string; code: string; priceAedFils: number }[] = [];
  for (const booth of booths) {
    const price = await getBoothPrice(booth, app.eventId);
    if (price == null) return { ok: false, reason: `Booth ${booth.code} has no price configured.` };
    priced.push({ boothId: booth.id, code: booth.code, priceAedFils: price });
  }
  return { ok: true, booths: priced, totalAedFils: priced.reduce((sum, p) => sum + p.priceAedFils, 0) };
}

export type RecordOfflinePaymentResult =
  | { ok: true; paymentId: string; receiptNumber: string }
  | { ok: false; status: number; error: string };

export async function recordOfflinePayment(input: {
  applicationId: string;
  method: OfflinePaymentMethod;
  reference: string;
  note: string | null;
  /** The total the admin saw and confirmed. Must equal the server's quote,
   *  so a price change between page load and submit can't slip through. */
  expectedAmountAedFils: number;
}): Promise<RecordOfflinePaymentResult> {
  const app = await prisma.application.findUnique({ where: { id: input.applicationId } });
  if (!app) return { ok: false, status: 404, error: "Not found" };

  await runExpiryPass(app.eventId);
  const quote = await getOfflinePaymentQuote(input.applicationId);
  if (!quote.ok) return { ok: false, status: 409, error: quote.reason };
  if (quote.totalAedFils !== input.expectedAmountAedFils) {
    return { ok: false, status: 409, error: "The amount due has changed since this page loaded. Reload and check it again." };
  }

  const paidAt = new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          applicationId: app.id,
          eventId: app.eventId,
          boothId: quote.booths[0].boothId,
          amountAedFils: quote.totalAedFils,
          currency: "AED",
          status: "PENDING",
          provider: "offline",
          providerRef: input.reference,
          method: input.method,
          note: input.note,
          booths: { create: quote.booths.map((b) => ({ boothId: b.boothId, priceAedFilsAtCharge: b.priceAedFils })) },
        },
      });

      // An online checkout the vendor opened and never finished must not
      // stay PENDING next to a recorded payment.
      const stale = await tx.payment.findMany({
        where: { applicationId: app.id, status: { in: ["CREATED", "PENDING", "AUTHORIZED"] }, id: { not: payment.id } },
        select: { id: true, status: true },
      });
      if (stale.length > 0) {
        await tx.payment.updateMany({ where: { id: { in: stale.map((p) => p.id) } }, data: { status: "FAILED" } });
        // An AUTHORISED online payment may be holding the vendor's money at
        // the provider: flag it so someone voids it there.
        const authorised = stale.filter((p) => p.status === "AUTHORIZED").map((p) => p.id);
        if (authorised.length > 0) {
          await tx.payment.updateMany({
            where: { id: { in: authorised } },
            data: { needsAttention: "Authorised online payment superseded by an offline payment. Void the authorisation with the provider." },
          });
        }
        for (const p of stale) {
          await logPaymentEvent(tx, {
            paymentId: p.id,
            applicationId: app.id,
            type: "SUPERSEDED",
            actor: "ADMIN",
            detail: { supersededBy: payment.id },
          });
        }
      }

      const { receiptNumber } = await finalizeBoothSale(tx, {
        applicationId: app.id,
        paymentId: payment.id,
        booths: quote.booths.map((b) => ({ boothId: b.boothId, priceAedFils: b.priceAedFils })),
        fromStages: ["REVIEW", "PAYMENT"],
        paidAt,
      });
      await logPaymentEvent(tx, {
        paymentId: payment.id,
        applicationId: app.id,
        type: "OFFLINE_RECORDED",
        actor: "ADMIN",
        detail: {
          method: input.method,
          reference: input.reference,
          amountAedFils: quote.totalAedFils,
          boothCodes: quote.booths.map((b) => b.code),
          receiptNumber,
        },
      });
      return { paymentId: payment.id, receiptNumber };
    });
    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof BoothHoldChangedError) {
      return { ok: false, status: 409, error: "The booth reservation changed while saving. Reload the page and check again." };
    }
    throw err;
  }
}
