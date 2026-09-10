import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import {
  sendApplicationApprovedEmail,
  sendApplicationRejectedEmail,
  sendAcceptanceExpiredEmail,
  sendPaymentSuccessEmail,
  sendWarningEmail,
} from "@/lib/email";
import { getReceiptData } from "@/lib/receipts";
import { trustedSiteUrl } from "@/lib/url";

// Retries a genuinely FAILED transactional email — only for the types where
// the current DB state can safely regenerate the exact same content (PART
// 34). Each retry is deliberately a fresh send with no dedupeKey: an admin
// clicking "Retry" is explicit intent, not a duplicate to suppress.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await prisma.emailDelivery.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status !== "FAILED") {
    return NextResponse.json({ error: "Only a failed delivery can be retried." }, { status: 400 });
  }
  if (!row.dedupeKey) {
    return NextResponse.json({ error: "This email type can't be safely regenerated — ask the vendor to trigger a new one." }, { status: 400 });
  }

  const [type, refId] = row.dedupeKey.split(":");

  switch (type) {
    case "application_accepted": {
      const application = await prisma.application.findUnique({ where: { id: refId }, include: { event: true } });
      if (!application || application.status !== "ACCEPTED" || !application.acceptanceExpiresAt) {
        return NextResponse.json({ error: "This application is no longer in an accepted state." }, { status: 409 });
      }
      await sendApplicationApprovedEmail({
        vendorId: application.vendorId,
        vendorEmail: application.email,
        businessName: application.businessName,
        eventId: application.eventId,
        eventName: application.event.name,
        eventStartDate: application.event.startDate,
        eventLocation: application.event.location,
        deadlineHours: application.acceptanceHoursUsed || 24,
        acceptanceExpiresAt: application.acceptanceExpiresAt,
      });
      break;
    }
    case "application_rejected": {
      const application = await prisma.application.findUnique({ where: { id: refId }, include: { event: true } });
      if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });
      await sendApplicationRejectedEmail({
        vendorId: application.vendorId,
        vendorEmail: application.email,
        businessName: application.businessName,
        eventId: application.eventId,
        eventName: application.event.name,
      });
      break;
    }
    case "application_expired": {
      const application = await prisma.application.findUnique({ where: { id: refId }, include: { event: true } });
      if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });
      await sendAcceptanceExpiredEmail({
        vendorId: application.vendorId,
        vendorEmail: application.email,
        businessName: application.businessName,
        eventId: application.eventId,
        eventName: application.event.name,
      });
      break;
    }
    case "payment_receipt": {
      const receipt = await getReceiptData(refId);
      const application = receipt ? await prisma.application.findUnique({ where: { id: receipt.applicationId } }) : null;
      if (!receipt || !application) return NextResponse.json({ error: "Payment/receipt not found." }, { status: 404 });
      await sendPaymentSuccessEmail({
        vendorId: receipt.vendorId,
        vendorEmail: receipt.email,
        businessName: receipt.businessName,
        eventId: application.eventId,
        eventName: receipt.eventName,
        eventStartDate: new Date(receipt.eventStartDate),
        eventLocation: receipt.eventLocation,
        boothCode: receipt.boothCode,
        boothSizeLabel: receipt.boothSizeLabel,
        subtotalAedFils: receipt.subtotalAedFils,
        vatAedFils: receipt.vatAedFils,
        vatApplicable: receipt.vatApplicable,
        totalAedFils: receipt.totalAedFils,
        receiptNumber: receipt.receiptNumber,
        paidAt: receipt.paidAt ? new Date(receipt.paidAt) : new Date(),
        receiptUrl: `${trustedSiteUrl()}/vendor/receipts/${receipt.paymentId}`,
        viewBookingUrl: `${trustedSiteUrl()}/vendor/applications/${receipt.applicationId}`,
      });
      break;
    }
    case "warning": {
      const warning = await prisma.vendorWarning.findUnique({ where: { id: refId }, include: { vendor: true, event: true } });
      if (!warning) return NextResponse.json({ error: "Warning not found." }, { status: 404 });
      await sendWarningEmail({
        vendorId: warning.vendorId,
        vendorEmail: warning.vendor.email,
        businessName: warning.vendor.businessName,
        title: warning.title,
        description: warning.description,
        severity: warning.severity,
        eventName: warning.event?.name ?? null,
      });
      break;
    }
    default:
      return NextResponse.json({ error: "This email type can't be retried from here." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
