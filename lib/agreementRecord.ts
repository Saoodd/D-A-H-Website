import "server-only";
import { prisma } from "./prisma";

export interface AgreementRecord {
  id: string;
  type: "VENDOR_TERMS" | "EVENT_TERMS";
  title: string;
  version: number;
  bodyHtml: string;
  businessName: string;
  contactName: string;
  representativeName: string | null;
  eventName: string | null;
  boothCode: string | null;
  applicationId: string | null;
  bookingId: string | null;
  acceptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  vendorId: string;
}

/** Loads a single acceptance as a self-contained, printable record — the
 *  historic snapshot text, never the (possibly since-edited) live
 *  agreement — plus the booth/booking context for an event acceptance.
 *  Shared by the vendor's own record view and the admin record view. */
export async function getAgreementRecord(acceptanceId: string): Promise<AgreementRecord | null> {
  const acceptance = await prisma.agreementAcceptance.findUnique({ where: { id: acceptanceId } });
  if (!acceptance) return null;

  let boothCode: string | null = null;
  let bookingId: string | null = null;

  if (acceptance.applicationId) {
    const [soldBooth, succeededPayment] = await Promise.all([
      prisma.booth.findFirst({
        where: { assignedApplicationId: acceptance.applicationId, status: "SOLD" },
        select: { code: true },
      }),
      prisma.payment.findFirst({
        where: { applicationId: acceptance.applicationId, status: "SUCCEEDED" },
        select: { id: true },
      }),
    ]);
    boothCode = soldBooth?.code ?? null;
    bookingId = succeededPayment?.id ?? null;
  }

  return {
    id: acceptance.id,
    type: acceptance.snapshotType as "VENDOR_TERMS" | "EVENT_TERMS",
    title: acceptance.snapshotTitle,
    version: acceptance.snapshotVersion,
    bodyHtml: acceptance.snapshotBodyHtml,
    businessName: acceptance.snapshotBusinessName,
    contactName: acceptance.snapshotContactName,
    representativeName: acceptance.representativeName,
    eventName: acceptance.snapshotEventName,
    boothCode,
    applicationId: acceptance.applicationId,
    bookingId,
    acceptedAt: acceptance.acceptedAt.toISOString(),
    ipAddress: acceptance.ipAddress,
    userAgent: acceptance.userAgent,
    vendorId: acceptance.vendorId,
  };
}
