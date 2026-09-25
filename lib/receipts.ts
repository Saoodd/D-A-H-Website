import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "./prisma";
import { splitVatInclusiveTotal, formatBoothCodes } from "./constants";

type Db = typeof prisma | Prisma.TransactionClient;

/** Assigns this payment its permanent receipt number, the moment it
 *  actually succeeds — never before, never again. nextval() on a Postgres
 *  sequence is atomic under concurrent successful payments, so two
 *  vendors paying at the same instant can never collide on one number.
 *  Idempotent: if this payment already has one (e.g. a retried request),
 *  it's returned unchanged rather than burning another sequence value.
 *  Accepts an optional transaction client so a caller (checkout/confirm)
 *  can assign the receipt number atomically alongside the booth-sold and
 *  payment-succeeded writes it belongs with — defaults to the top-level
 *  client for any caller that doesn't need that. */
export async function assignReceiptNumber(paymentId: string, paidAt: Date, db: Db = prisma): Promise<string> {
  const existing = await db.payment.findUnique({ where: { id: paymentId }, select: { receiptNumber: true } });
  if (existing?.receiptNumber) return existing.receiptNumber;

  const rows = await db.$queryRaw<{ nextval: string | bigint }[]>(Prisma.sql`SELECT nextval('"ReceiptNumberSeq"') as nextval`);
  const seq = String(rows[0].nextval);
  const receiptNumber = `DAH-RCP-${paidAt.getFullYear()}-${seq.padStart(6, "0")}`;

  await db.payment.update({ where: { id: paymentId }, data: { receiptNumber } });
  return receiptNumber;
}

export interface ReceiptBoothLine {
  code: string;
  sizeLabel: string;
  priceAedFils: number;
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
  // Backward-compatible aliases — a single-booth payment's real code/size
  // label; for a multi-booth payment these are joined ("B3 + B4") so
  // every existing single-booth-assuming display (email subject, admin
  // transaction tables) keeps rendering something sensible unchanged. New
  // code should prefer `booths` below, which is never ambiguous.
  boothCode: string;
  boothSizeLabel: string;
  /** Every booth this payment actually covers, each with its own charged
   *  price — the authoritative multi-booth breakdown. Exactly one entry
   *  for a normal single-booth booking. */
  booths: ReceiptBoothLine[];
  // Only set when a real, currently-configured PricingTier backs the
  // booth's size and marks its price as VAT-inclusive — never a guessed
  // split. When false, subtotalAedFils === totalAedFils and vatAedFils is 0;
  // callers should show only "Total Paid", not a fabricated breakdown. For
  // a multi-booth payment, true only when EVERY booth's tier is
  // VAT-inclusive — a receipt never shows a partial/inconsistent VAT split.
  vatApplicable: boolean;
  subtotalAedFils: number;
  vatAedFils: number;
  totalAedFils: number;
  paidAt: string | null;
  provider: string;
  // BANK_TRANSFER | CASH | CARD_POS | OTHER for admin-recorded payments
  // (provider "offline"); null for gateway payments.
  method: string | null;
  providerRef: string | null;
}

/** The single authoritative receipt computation — used by the vendor's
 *  inline payment summary, the vendor's printable receipt, and the admin's
 *  printable receipt, so all three can never disagree. Only a SUCCEEDED
 *  payment has a receipt. Reads every booth this payment covers via
 *  PaymentBooth (always at least one row — see the migration that
 *  introduced it, which backfilled one PaymentBooth row per historical
 *  Payment), never just the single `Payment.boothId` shortcut, so a
 *  multi-booth receipt is never missing a line. */
export async function getReceiptData(paymentId: string): Promise<ReceiptData | null> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      application: true,
      booths: { include: { booth: true } },
    },
  });
  if (!payment || payment.status !== "SUCCEEDED") return null;

  const [event, tiers] = await Promise.all([
    prisma.event.findUnique({ where: { id: payment.eventId }, select: { name: true, startDate: true, location: true } }),
    prisma.pricingTier.findMany({ where: { sizeKey: { in: payment.booths.map((pb) => pb.booth.size) } } }),
  ]);
  if (!event) return null;

  const tierBySizeKey = new Map(tiers.map((t) => [t.sizeKey, t]));
  const vatApplicable = payment.booths.length > 0 && payment.booths.every((pb) => tierBySizeKey.get(pb.booth.size)?.vatInclusive);

  let subtotalAedFils = 0;
  let vatAedFils = 0;
  const booths: ReceiptBoothLine[] = payment.booths.map((pb) => {
    const tier = tierBySizeKey.get(pb.booth.size);
    if (vatApplicable) {
      const split = splitVatInclusiveTotal(pb.priceAedFilsAtCharge);
      subtotalAedFils += split.baseAedFils;
      vatAedFils += split.vatAedFils;
    } else {
      subtotalAedFils += pb.priceAedFilsAtCharge;
    }
    return { code: pb.booth.code, sizeLabel: tier?.label ?? pb.booth.size, priceAedFils: pb.priceAedFilsAtCharge };
  });

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
    boothCode: formatBoothCodes(booths.map((b) => b.code)),
    boothSizeLabel: Array.from(new Set(booths.map((b) => b.sizeLabel))).join(", "),
    booths,
    vatApplicable,
    subtotalAedFils,
    vatAedFils,
    totalAedFils: payment.amountAedFils,
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    provider: payment.provider,
    method: payment.method,
    providerRef: payment.providerRef,
  };
}
