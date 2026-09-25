import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "./prisma";
import { assignReceiptNumber, getReceiptData } from "./receipts";
import { sendPaymentSuccessEmail } from "./email";
import { notifyVendorWhatsApp } from "./notifications/notify";
import { applicationUrl } from "./notifications/links";
import { trustedSiteUrl } from "./url";
import { formatAed } from "./constants";

// The one place a booking becomes "confirmed and paid". Used by the online
// checkout confirm route and by the admin "Record offline payment" route,
// so both paths write exactly the same rows and send exactly the same
// notifications.

type Db = typeof prisma | Prisma.TransactionClient;

export type PaymentEventType = "CREATED" | "SUCCEEDED" | "FAILED" | "OFFLINE_RECORDED" | "SUPERSEDED";
export type PaymentEventActor = "VENDOR" | "ADMIN" | "SYSTEM" | "GATEWAY";

/** Appends one row to the payment audit log. Rows are never updated or
 *  deleted by the app. `detail` must never contain secrets or card data. */
export async function logPaymentEvent(
  db: Db,
  event: {
    paymentId: string | null;
    applicationId: string;
    type: PaymentEventType;
    actor: PaymentEventActor;
    detail?: Prisma.InputJsonValue;
  }
) {
  await db.paymentEvent.create({ data: event });
}

export class BoothHoldChangedError extends Error {
  constructor() {
    super("BOOTH_HOLD_CHANGED");
  }
}

/** Marks the booths SOLD and the (still PENDING) payment SUCCEEDED, clears the acceptance
 *  deadline and assigns the receipt number — all inside the caller's
 *  transaction, so a crash can never leave a booth sold against an unpaid
 *  payment (or the reverse).
 *
 *  The booth updateMany re-checks, inside the transaction, that every
 *  booth is still held by this application at one of `fromStages`; if any
 *  isn't, it throws BoothHoldChangedError and the whole transaction rolls
 *  back — a multi-booth sale is all-or-nothing.
 *
 *  application.status stays "ACCEPTED": there is no separate CONFIRMED
 *  status — getDisplayStatus() derives "PAID" from ACCEPTED plus a
 *  succeeded payment. The acceptance deadline is cleared so lib/expiry.ts
 *  can never later flip a paid booking to ACCEPTANCE_EXPIRED. */
export async function finalizeBoothSale(
  tx: Prisma.TransactionClient,
  opts: {
    applicationId: string;
    paymentId: string;
    booths: { boothId: string; priceAedFils: number }[];
    fromStages: ("REVIEW" | "PAYMENT")[];
    paidAt: Date;
  }
): Promise<{ receiptNumber: string }> {
  const { applicationId, paymentId, booths, fromStages, paidAt } = opts;
  const boothIds = booths.map((b) => b.boothId);

  const sale = await tx.booth.updateMany({
    where: { id: { in: boothIds }, heldByApplicationId: applicationId, status: "HELD", holdStage: { in: fromStages } },
    data: {
      status: "SOLD",
      assignedApplicationId: applicationId,
      heldByApplicationId: null,
      holdStage: null,
      holdExpiresAt: null,
      soldAt: paidAt,
    },
  });
  if (booths.length === 0 || sale.count !== boothIds.length) throw new BoothHoldChangedError();

  // The sale-price snapshot is per booth, unlike the shared fields above.
  await Promise.all(
    booths.map((b) => tx.booth.update({ where: { id: b.boothId }, data: { priceAedFilsAtSale: b.priceAedFils } }))
  );
  // Only a still-PENDING payment can succeed — never one already FAILED or
  // superseded by an admin-recorded payment.
  const paid = await tx.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "SUCCEEDED", paidAt } });
  if (paid.count !== 1) throw new BoothHoldChangedError();
  await tx.application.update({ where: { id: applicationId }, data: { acceptanceExpiresAt: null } });
  const receiptNumber = await assignReceiptNumber(paymentId, paidAt, tx);
  return { receiptNumber };
}

/** Receipt email plus PAYMENT_RECEIVED / BOOKING_CONFIRMED WhatsApp
 *  messages. Runs after the transaction commits. Every send is deduped on
 *  the payment id, so calling this twice for one payment is harmless. The
 *  numbers come from getReceiptData, the same source as the printable
 *  receipt, so the email can never disagree with it. */
export async function sendBookingConfirmedNotifications(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { application: { include: { event: true } } },
  });
  const receipt = await getReceiptData(paymentId);
  if (!payment || !receipt) return;
  const application = payment.application;
  const paidAt = payment.paidAt ?? new Date();

  await sendPaymentSuccessEmail({
    vendorId: application.vendorId,
    vendorEmail: application.email,
    businessName: application.businessName,
    eventId: application.eventId,
    eventName: application.event.name,
    eventStartDate: application.event.startDate,
    eventLocation: application.event.location,
    boothCode: receipt.boothCode,
    boothSizeLabel: receipt.boothSizeLabel,
    subtotalAedFils: receipt.subtotalAedFils,
    vatAedFils: receipt.vatAedFils,
    vatApplicable: receipt.vatApplicable,
    totalAedFils: receipt.totalAedFils,
    receiptNumber: receipt.receiptNumber,
    paidAt,
    receiptUrl: `${trustedSiteUrl()}/vendor/receipts/${paymentId}`,
    viewBookingUrl: `${trustedSiteUrl()}/vendor/applications/${application.id}`,
    dedupeKey: `payment_receipt:${paymentId}`,
  });

  const whatsAppData = {
    business_name: application.businessName,
    event_name: application.event.name,
    booth: receipt.boothCode,
    amount_paid: formatAed(receipt.totalAedFils),
    booking_url: applicationUrl(application.id),
  };
  for (const useCase of ["PAYMENT_RECEIVED", "BOOKING_CONFIRMED"] as const) {
    await notifyVendorWhatsApp({
      useCase,
      vendorId: application.vendorId,
      eventId: application.eventId,
      applicationId: application.id,
      paymentId,
      data: whatsAppData,
    });
  }
}
