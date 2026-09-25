import "server-only";
import { prisma } from "./prisma";
import { lifecycleStatus, type LifecycleStatus } from "./paymentLifecycle";

export interface VendorPaymentView {
  id: string;
  applicationId: string;
  lifecycle: LifecycleStatus;
  needsAttention: boolean;
  amountAedFils: number;
  receiptNumber: string | null;
}

/** A vendor's own view of one payment, or null if it isn't theirs. The
 *  internal attention reason is never exposed, only that one exists. */
export async function getVendorPaymentView(paymentId: string, vendorId: string): Promise<VendorPaymentView | null> {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { application: { select: { vendorId: true } } } });
  if (!p || p.application.vendorId !== vendorId) return null;
  return {
    id: p.id,
    applicationId: p.applicationId,
    lifecycle: lifecycleStatus(p),
    needsAttention: !!p.needsAttention,
    amountAedFils: p.amountAedFils,
    receiptNumber: p.receiptNumber,
  };
}
