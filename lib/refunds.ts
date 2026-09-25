import "server-only";
import { prisma } from "./prisma";
import { logPaymentEvent } from "./bookingPayment";
import { getGateway } from "@/payments/gateway";

export const REFUND_METHODS = ["ORIGINAL_METHOD", "BANK_TRANSFER", "CASH", "OTHER"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export type RecordRefundResult = { ok: true; refundId: string; refundedAedFils: number } | { ok: false; status: number; error: string };

/** Records money returned against a paid payment. Refunding never cancels
 *  the booking or frees its booth. That stays a separate, explicit admin
 *  decision.
 *
 *  ORIGINAL_METHOD refunds through the payment provider and is only
 *  allowed when that provider supports refunds (the sandbox and offline
 *  payments don't). Every other method records a refund DAH has already
 *  paid back by hand. */
export async function recordRefund(input: {
  paymentId: string;
  amountAedFils: number;
  reason: string;
  method: RefundMethod;
  reference: string | null;
}): Promise<RecordRefundResult> {
  const payment = await prisma.payment.findUnique({ where: { id: input.paymentId } });
  if (!payment) return { ok: false, status: 404, error: "Payment not found." };
  if (payment.status !== "SUCCEEDED") return { ok: false, status: 409, error: "Only a paid payment can be refunded." };
  const remaining = payment.amountAedFils - payment.refundedAedFils;
  if (input.amountAedFils > remaining) {
    return { ok: false, status: 409, error: `That's more than the refundable balance (${remaining} fils).` };
  }

  let providerRefundId: string | null = null;
  if (input.method === "ORIGINAL_METHOD") {
    const gateway = getGateway();
    if (payment.provider !== gateway.name || !gateway.refund || !payment.providerRef) {
      return { ok: false, status: 400, error: "This payment can't be refunded through the payment provider. Refund it by hand and record how." };
    }
    // External call first, outside any transaction. If recording below
    // fails, the provider refund id is logged so it can be reconciled.
    const res = await gateway.refund(payment.providerRef, input.amountAedFils, input.reason);
    providerRefundId = res.providerRefundId;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Atomic cap: only increments while the running total stays within
      // the amount paid, so two concurrent refunds can't over-refund.
      const bumped = await tx.payment.updateMany({
        where: { id: payment.id, status: "SUCCEEDED", refundedAedFils: { lte: payment.amountAedFils - input.amountAedFils } },
        data: { refundedAedFils: { increment: input.amountAedFils } },
      });
      if (bumped.count !== 1) throw new Error("REFUND_EXCEEDS_BALANCE");
      const refund = await tx.paymentRefund.create({
        data: {
          paymentId: payment.id,
          amountAedFils: input.amountAedFils,
          reason: input.reason,
          method: input.method,
          reference: input.reference,
          providerRefundId,
        },
      });
      const after = await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, select: { refundedAedFils: true } });
      await logPaymentEvent(tx, {
        paymentId: payment.id,
        applicationId: payment.applicationId,
        type: "REFUNDED",
        actor: "ADMIN",
        detail: { amountAedFils: input.amountAedFils, method: input.method, reason: input.reason, reference: input.reference, providerRefundId, refundedTotal: after.refundedAedFils },
      });
      return { ok: true as const, refundId: refund.id, refundedAedFils: after.refundedAedFils };
    });
  } catch (err) {
    if (providerRefundId) console.error(`[payments] provider refund ${providerRefundId} succeeded but recording it failed for payment ${payment.id}`);
    if (err instanceof Error && err.message === "REFUND_EXCEEDS_BALANCE") {
      return { ok: false, status: 409, error: "The refundable balance changed. Reload and try again." };
    }
    throw err;
  }
}
