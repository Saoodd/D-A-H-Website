import "server-only";
import { prisma } from "./prisma";
import { BoothHoldChangedError, finalizeBoothSale, logPaymentEvent, sendBookingConfirmedNotifications, type PaymentEventActor } from "./bookingPayment";
import { legalSourcesFor, type StoredPaymentStatus } from "./paymentLifecycle";
import { getGateway, type ProviderPaymentResult } from "@/payments/gateway";

// Applying what a payment provider reports — from a verified webhook, a
// reconciliation poll, or the return page's server-side refresh. All three
// go through applyProviderResult, so a payment can only ever move along the
// lifecycle in lib/paymentLifecycle.ts, and each move happens at most once
// (every write is a conditional update guarded on the current status).

export type ApplyOutcome =
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "IGNORED"
  | "AMOUNT_MISMATCH"
  | "NEEDS_ATTENTION"
  | "NO_PAYMENT";

async function flagAttention(paymentId: string, applicationId: string, reason: string, actor: PaymentEventActor, detail: Record<string, string | number | null>) {
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { needsAttention: reason } });
    await logPaymentEvent(tx, { paymentId, applicationId, type: "NEEDS_ATTENTION", actor, detail: { reason, ...detail } });
  });
  console.error(`[payments] payment ${paymentId} needs attention: ${reason}`);
}

/** Moves a payment to a non-paid state if (and only if) that transition is
 *  legal from its current state. Returns whether anything changed. */
async function transition(paymentId: string, applicationId: string, to: Exclude<StoredPaymentStatus, "SUCCEEDED">, actor: PaymentEventActor, detail: Record<string, string | number | null>) {
  return prisma.$transaction(async (tx) => {
    const res = await tx.payment.updateMany({ where: { id: paymentId, status: { in: legalSourcesFor(to) } }, data: { status: to } });
    if (res.count === 0) return false;
    await logPaymentEvent(tx, { paymentId, applicationId, type: to === "PENDING" || to === "CREATED" ? "CREATED" : to, actor, detail });
    return true;
  });
}

export async function applyProviderResult(
  paymentId: string,
  result: ProviderPaymentResult,
  actor: PaymentEventActor,
  source: string
): Promise<ApplyOutcome> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { booths: true } });
  if (!payment) return "NO_PAYMENT";
  const detail = { source, providerRef: result.providerRef, providerState: result.state };

  // Never trust an amount we didn't charge. Compared exactly, in fils.
  if (result.state !== "PENDING" && (result.currency !== payment.currency || result.amountAedFils !== payment.amountAedFils)) {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { needsAttention: `Provider reported ${result.currency} ${result.amountAedFils} fils, expected ${payment.currency} ${payment.amountAedFils}` },
      });
      await logPaymentEvent(tx, {
        paymentId,
        applicationId: payment.applicationId,
        type: "AMOUNT_MISMATCH",
        actor,
        detail: { ...detail, reportedAmount: result.amountAedFils, reportedCurrency: result.currency, expectedAmount: payment.amountAedFils },
      });
    });
    return "AMOUNT_MISMATCH";
  }

  switch (result.state) {
    case "PENDING":
      return "IGNORED";
    case "AUTHORIZED":
      return (await transition(paymentId, payment.applicationId, "AUTHORIZED", actor, detail)) ? "APPLIED" : "ALREADY_APPLIED";
    case "FAILED":
    case "CANCELLED": {
      if (payment.status === "SUCCEEDED") {
        // A paid payment can't become unpaid on the provider's say-so.
        await flagAttention(paymentId, payment.applicationId, `Provider reported ${result.state} for a payment already recorded as paid`, actor, detail);
        return "NEEDS_ATTENTION";
      }
      return (await transition(paymentId, payment.applicationId, result.state, actor, detail)) ? "APPLIED" : "ALREADY_APPLIED";
    }
    case "PAID": {
      if (payment.status === "SUCCEEDED") return "ALREADY_APPLIED";
      if (payment.status === "FAILED" || payment.status === "CANCELLED") {
        // Money arrived for a payment we'd given up on (e.g. superseded by
        // an offline payment, or its hold expired). Never auto-sell: a
        // person decides between refunding and assigning a booth.
        await flagAttention(paymentId, payment.applicationId, `Provider reported PAID for a payment already marked ${payment.status}`, actor, detail);
        return "NEEDS_ATTENTION";
      }
      const paidAt = new Date();
      try {
        await prisma.$transaction(async (tx) => {
          const { receiptNumber } = await finalizeBoothSale(tx, {
            applicationId: payment.applicationId,
            paymentId,
            booths: payment.booths.map((pb) => ({ boothId: pb.boothId, priceAedFils: pb.priceAedFilsAtCharge })),
            fromStages: ["PAYMENT"],
            paidAt,
          });
          await logPaymentEvent(tx, { paymentId, applicationId: payment.applicationId, type: "SUCCEEDED", actor, detail: { ...detail, receiptNumber } });
        });
      } catch (err) {
        if (err instanceof BoothHoldChangedError) {
          // Paid, but the booth hold lapsed or changed first. Record it for
          // a person rather than selling a booth that may now be someone
          // else's.
          await flagAttention(paymentId, payment.applicationId, "Provider reported PAID after the booth hold had lapsed or changed", actor, detail);
          return "NEEDS_ATTENTION";
        }
        throw err;
      }
      await sendBookingConfirmedNotifications(paymentId);
      return "APPLIED";
    }
  }
}

/** Asks the provider for one payment's current state (server to server)
 *  and applies it. No-op for providers without getPaymentStatus (the
 *  sandbox, offline payments) and for payments already settled. */
export async function refreshFromProvider(paymentId: string, source: string): Promise<ApplyOutcome | "SKIPPED"> {
  const gateway = getGateway();
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !payment.providerRef || payment.provider !== gateway.name || !gateway.getPaymentStatus) return "SKIPPED";
  if (payment.status !== "PENDING" && payment.status !== "AUTHORIZED" && payment.status !== "CREATED") return "SKIPPED";
  const result = await gateway.getPaymentStatus(payment.providerRef);
  return applyProviderResult(paymentId, result, "SYSTEM", source);
}

/** Reconciliation sweep (run from the cron route): re-checks open payments
 *  with the provider, so a missed or delayed webhook can't leave a paid
 *  booking stuck as pending. Bounded per run. */
export async function reconcileOpenPayments(opts: { olderThanMs?: number; limit?: number } = {}) {
  const gateway = getGateway();
  if (!gateway.getPaymentStatus) return { checked: 0, results: {} as Record<string, number> };
  const now = Date.now();
  const open = await prisma.payment.findMany({
    where: {
      provider: gateway.name,
      status: { in: ["CREATED", "PENDING", "AUTHORIZED"] },
      createdAt: { lt: new Date(now - (opts.olderThanMs ?? 2 * 60 * 1000)), gt: new Date(now - 7 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 50,
  });
  const results: Record<string, number> = {};
  for (const p of open) {
    try {
      const outcome = await refreshFromProvider(p.id, "reconciliation");
      results[outcome] = (results[outcome] ?? 0) + 1;
    } catch (err) {
      results.ERROR = (results.ERROR ?? 0) + 1;
      console.error(`[payments] reconciliation failed for ${p.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return { checked: open.length, results };
}
