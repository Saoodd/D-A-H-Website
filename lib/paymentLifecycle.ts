// Payment lifecycle: the stored states, which transitions are legal, and
// the public 8-state vocabulary used in the admin UI and exports.
// Pure functions only; safe on server and client.
//
// Stored `Payment.status` values:
//   CREATED    row exists, provider session not opened yet (reserved for
//              live providers that need the row before redirecting)
//   PENDING    charge opened with the provider, outcome unknown
//   AUTHORIZED provider authorised but has not captured the money yet
//   SUCCEEDED  money received — shown everywhere as "PAID". The stored
//              name predates this module; bookings, receipts and
//              dashboards key off it, so it was deliberately not renamed.
//   FAILED     declined, errored, expired or superseded
//   CANCELLED  the payer abandoned or cancelled at the provider
//
// Refunds never change the stored status. They are money records
// (PaymentRefund rows plus Payment.refundedAedFils), so a refund can't
// silently turn a confirmed booking back into an unpaid one. The derived
// REFUNDED / PARTIALLY_REFUNDED states below come from the refunded amount.

export const STORED_PAYMENT_STATUSES = ["CREATED", "PENDING", "AUTHORIZED", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
export type StoredPaymentStatus = (typeof STORED_PAYMENT_STATUSES)[number];

export type LifecycleStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

const TRANSITIONS: Record<StoredPaymentStatus, readonly StoredPaymentStatus[]> = {
  CREATED: ["PENDING", "FAILED", "CANCELLED"],
  PENDING: ["AUTHORIZED", "SUCCEEDED", "FAILED", "CANCELLED"],
  AUTHORIZED: ["SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: string, to: StoredPaymentStatus): boolean {
  return (TRANSITIONS[from as StoredPaymentStatus] ?? []).includes(to);
}

/** Stored states a payment may be in for a move to `to` to be legal —
 *  used as the WHERE guard of a conditional update, so two concurrent
 *  writers (webhook + reconciliation, say) can never both apply. */
export function legalSourcesFor(to: StoredPaymentStatus): StoredPaymentStatus[] {
  return STORED_PAYMENT_STATUSES.filter((from) => TRANSITIONS[from].includes(to));
}

export function isTerminal(status: string): boolean {
  return (TRANSITIONS[status as StoredPaymentStatus] ?? []).length === 0;
}

export function lifecycleStatus(payment: { status: string; amountAedFils: number; refundedAedFils?: number | null }): LifecycleStatus {
  if (payment.status === "SUCCEEDED") {
    const refunded = payment.refundedAedFils ?? 0;
    if (refunded >= payment.amountAedFils && payment.amountAedFils > 0) return "REFUNDED";
    if (refunded > 0) return "PARTIALLY_REFUNDED";
    return "PAID";
  }
  return (STORED_PAYMENT_STATUSES as readonly string[]).includes(payment.status) ? (payment.status as LifecycleStatus) : "PENDING";
}

export const LIFECYCLE_LABEL: Record<LifecycleStatus, string> = {
  CREATED: "Created",
  PENDING: "Pending",
  AUTHORIZED: "Authorised",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};
