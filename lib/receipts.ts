import "server-only";
import { prisma } from "./prisma";
import { splitVatInclusiveTotal } from "./constants";

/** Assigns this payment its permanent receipt number, the moment it
 *  actually succeeds — never before, never again. nextval() on a Postgres
 *  sequence is atomic under concurrent successful payments, so two
 *  vendors paying at the same instant can never collide on one number.
 *  Idempotent: if this payment already has one (e.g. a retried request),
 *  it's returned unchanged rather than burning another sequence value. */
export async function assignReceiptNumber(paymentId: string, paidAt: Date): Promise<string> {
  const existing = await prisma.payment.findUnique({ where: { id: paymentId }, select: { receiptNumber: true } });
  if (existing?.receiptNumber) return existing.receiptNumber;

  const rows = await prisma.$queryRawUnsafe<{ nextval: string | bigint }[]>(`SELECT nextval('"ReceiptNumberSeq"') as nextval`);
  const seq = String(rows[0].nextval);
  const receiptNumber = `DAH-RCP-${paidAt.getFullYear()}-${seq.padStart(6, "0")}`;

  await prisma.payment.update({ where: { id: paymentId }, data: { receiptNumber } });
  return receiptNumber;
}

export interface ReceiptData {
  paymentId: string;
  receiptNumber: string | null;
  status: string;
  vendorId: string;
  applicationId: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  eventName: string;
  eventStartDate: string;
  eventLocation: string;
  boothCode: string;
  boothSizeLabel: string;
  // Only set when a real, currently-configured PricingTier backs this
  // booth's size and marks its price as VAT-inclusive — never a guessed
  // split. When false, subtotalAedFils === totalAedFils and vatAedFils is 0;
  // callers should show only "Total Paid", not a fabricated breakdown.
  vatApplicable: boolean;
  subtotalAedFils: number;
  vatAedFils: number;
  totalAedFils: number;
  paidAt: string | null;
  provider: string;
  providerRef: string | null;
}

/** The single authoritative receipt computation — used by the vendor's
 *  inline payment summary, the vendor's printable receipt, and the admin's
 *  printable receipt, so all three can never disagree. Only a SUCCEEDED
 *  payment has a receipt. */
export async function getReceiptData(paymentId: string): Promise<ReceiptData | null> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      application: true,
      booth: true,
    },
  });
  if (!payment || payment.status !== "SUCCEEDED") return null;

  const [event, tier] = await Promise.all([
    prisma.event.findUnique({ where: { id: payment.eventId }, select: { name: true, startDate: true, location: true } }),
    prisma.pricingTier.findUnique({ where: { sizeKey: payment.booth.size } }),
  ]);
  if (!event) return null;

  const vatApplicable = !!tier?.vatInclusive;
  const split = vatApplicable ? splitVatInclusiveTotal(payment.amountAedFils) : { baseAedFils: payment.amountAedFils, vatAedFils: 0 };

  return {
    paymentId: payment.id,
    receiptNumber: payment.receiptNumber,
    status: payment.status,
    vendorId: payment.application.vendorId,
    applicationId: payment.applicationId,
    businessName: payment.application.businessName,
    contactName: payment.application.contactName,
    email: payment.application.email,
    phone: payment.application.phone,
    eventName: event.name,
    eventStartDate: event.startDate.toISOString(),
    eventLocation: event.location,
    boothCode: payment.booth.code,
    boothSizeLabel: tier?.label ?? payment.booth.size,
    vatApplicable,
    subtotalAedFils: split.baseAedFils,
    vatAedFils: split.vatAedFils,
    totalAedFils: payment.amountAedFils,
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    provider: payment.provider,
    providerRef: payment.providerRef,
  };
}
