import "server-only";
import { prisma } from "./prisma";
import { runExpiryPass } from "./expiry";
import { getDisplayStatus } from "./status";
import { getSettings } from "./settings";
import { DisplayStatus } from "./constants";
import { eventHasPublishedTerms, hasAcceptedCurrentEventTerms } from "./agreements";
import { getReceiptData, type ReceiptData } from "./receipts";

export interface ApplicationView {
  id: string;
  event: {
    id: string;
    slug: string;
    name: string;
    startDate: string;
    location: string;
    whatsappVendorGroupLink: string | null; // only populated when displayStatus === "PAID"
  };
  businessName: string;
  status: string;
  displayStatus: DisplayStatus;
  acceptanceExpiresAt: string | null;
  // The 2-minute booth-selection session — only meaningful while no booth
  // is currently held (see BOOTH_SELECTION_SESSION_MINUTES). null once a
  // booth is confirmed, expired, or never started.
  boothSelectionExpiresAt: string | null;
  boothHold: {
    boothId: string;
    code: string;
    size: string;
    holdStage: string | null;
    holdExpiresAt: string | null;
  } | null;
  soldBooth: {
    boothId: string;
    code: string;
    size: string;
    priceAedFils: number | null;
    soldAt: string | null;
  } | null;
  latestPayment: {
    id: string;
    status: string;
    amountAedFils: number;
    providerRef: string | null;
  } | null;
  // Only set once a payment has actually SUCCEEDED — the same authoritative
  // computation used by both the vendor's and admin's printable receipts.
  receipt: ReceiptData | null;
  cancellationRequested: boolean;
  communityLink: string | null;
  // Every event carries its own independent Terms & Conditions (never a
  // shared global template) — these reflect THIS event's currently
  // published agreement, if any, and whether this vendor has accepted
  // that exact version for this application.
  eventTermsRequired: boolean;
  eventTermsAccepted: boolean;
}

/** Loads an application for the owning vendor, running the expiry pass first
 *  so status is always current. Returns null if it doesn't exist or belongs
 *  to a different vendor — callers should treat that as "not found". */
export async function getApplicationView(
  applicationId: string,
  vendorId: string
): Promise<ApplicationView | null> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { event: true },
  });
  if (!app || app.vendorId !== vendorId) return null;

  await runExpiryPass(app.eventId);

  const fresh = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      event: true,
      heldBooths: true,
      assignedBooths: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      cancellationRequests: true,
    },
  });

  const succeededPayment = await prisma.payment.findFirst({
    where: { applicationId, status: "SUCCEEDED" },
  });

  const displayStatus = getDisplayStatus(fresh, !!succeededPayment);
  const settings = await getSettings();

  const heldBooth = fresh.heldBooths.find((b) => b.status === "HELD") || null;
  const soldBooth = fresh.assignedBooths.find((b) => b.status === "SOLD") || null;
  const latest = fresh.payments[0] || null;

  const eventTermsRequired = await eventHasPublishedTerms(fresh.eventId);
  const eventTermsAccepted = eventTermsRequired
    ? await hasAcceptedCurrentEventTerms(vendorId, applicationId, fresh.eventId)
    : true;
  const receipt = succeededPayment ? await getReceiptData(succeededPayment.id) : null;

  return {
    id: fresh.id,
    event: {
      id: fresh.event.id,
      slug: fresh.event.slug,
      name: fresh.event.name,
      startDate: fresh.event.startDate.toISOString(),
      location: fresh.event.location,
      whatsappVendorGroupLink: displayStatus === "PAID" ? fresh.event.whatsappVendorGroupLink : null,
    },
    businessName: fresh.businessName,
    status: fresh.status,
    displayStatus,
    acceptanceExpiresAt: fresh.acceptanceExpiresAt ? fresh.acceptanceExpiresAt.toISOString() : null,
    boothSelectionExpiresAt:
      !heldBooth && fresh.boothSelectionExpiresAt && fresh.boothSelectionExpiresAt > new Date()
        ? fresh.boothSelectionExpiresAt.toISOString()
        : null,
    boothHold: heldBooth
      ? {
          boothId: heldBooth.id,
          code: heldBooth.code,
          size: heldBooth.size,
          holdStage: heldBooth.holdStage,
          holdExpiresAt: heldBooth.holdExpiresAt ? heldBooth.holdExpiresAt.toISOString() : null,
        }
      : null,
    soldBooth: soldBooth
      ? {
          boothId: soldBooth.id,
          code: soldBooth.code,
          size: soldBooth.size,
          priceAedFils: soldBooth.priceAedFilsAtSale,
          soldAt: soldBooth.soldAt ? soldBooth.soldAt.toISOString() : null,
        }
      : null,
    latestPayment: latest
      ? { id: latest.id, status: latest.status, amountAedFils: latest.amountAedFils, providerRef: latest.providerRef }
      : null,
    receipt,
    cancellationRequested: fresh.cancellationRequests.length > 0,
    communityLink: settings.mainCommunityWhatsappLink,
    eventTermsRequired,
    eventTermsAccepted,
  };
}
