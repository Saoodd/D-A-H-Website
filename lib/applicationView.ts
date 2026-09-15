import "server-only";
import { prisma } from "./prisma";
import { runExpiryPass } from "./expiry";
import { getDisplayStatus } from "./status";
import { getSettings, getAllowMultipleBooths } from "./settings";
import { getBoothPrice } from "./pricing";
import { DisplayStatus } from "./constants";
import { eventHasPublishedTerms, hasAcceptedCurrentEventTerms } from "./agreements";
import { getReceiptData, type ReceiptData } from "./receipts";

export interface BoothHoldInfo {
  boothId: string;
  code: string;
  size: string;
  holdStage: string | null;
  holdExpiresAt: string | null;
  priceAedFils: number | null;
  widthMm: number | null;
  depthMm: number | null;
}

export interface SoldBoothInfo {
  boothId: string;
  code: string;
  size: string;
  priceAedFils: number | null;
  soldAt: string | null;
  widthMm: number | null;
  depthMm: number | null;
}

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
  // Whether this event currently allows booking more than one booth (still
  // capped at MAX_BOOTHS_PER_BOOKING) — resolved server-side from
  // Event.allowMultipleBooths / Settings.allowMultipleBoothsDefault so the
  // client never has to know about that override chain.
  allowMultipleBooths: boolean;
  // The vendor's declared setup footprint for THIS application — null
  // until they've entered it (see requirement: setup size collected before
  // booth selection). Snapshotted at apply time; never silently changed by
  // a later profile edit.
  setupWidthMm: number | null;
  setupDepthMm: number | null;
  // Every booth this application currently holds (0, 1, or up to
  // MAX_BOOTHS_PER_BOOKING) — all share the same holdStage/holdExpiresAt
  // since they were claimed together in one atomic hold.
  boothHolds: BoothHoldInfo[];
  // Every booth this application was actually sold (0, 1, or up to
  // MAX_BOOTHS_PER_BOOKING).
  soldBooths: SoldBoothInfo[];
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

  const heldBooths = fresh.heldBooths.filter((b) => b.status === "HELD");
  const soldBooths = fresh.assignedBooths.filter((b) => b.status === "SOLD");
  const latest = fresh.payments[0] || null;

  const eventTermsRequired = await eventHasPublishedTerms(fresh.eventId);
  const eventTermsAccepted = eventTermsRequired
    ? await hasAcceptedCurrentEventTerms(vendorId, applicationId, fresh.eventId)
    : true;
  const receipt = succeededPayment ? await getReceiptData(succeededPayment.id) : null;
  const allowMultipleBooths = await getAllowMultipleBooths(fresh.event.allowMultipleBooths);

  const boothHolds: BoothHoldInfo[] = await Promise.all(
    heldBooths.map(async (b) => ({
      boothId: b.id,
      code: b.code,
      size: b.size,
      holdStage: b.holdStage,
      holdExpiresAt: b.holdExpiresAt ? b.holdExpiresAt.toISOString() : null,
      priceAedFils: await getBoothPrice(b, fresh.eventId),
      widthMm: b.widthMm,
      depthMm: b.depthMm,
    }))
  );

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
      heldBooths.length === 0 && fresh.boothSelectionExpiresAt && fresh.boothSelectionExpiresAt > new Date()
        ? fresh.boothSelectionExpiresAt.toISOString()
        : null,
    allowMultipleBooths,
    setupWidthMm: fresh.setupWidthMm,
    setupDepthMm: fresh.setupDepthMm,
    boothHolds,
    soldBooths: soldBooths.map((b) => ({
      boothId: b.id,
      code: b.code,
      size: b.size,
      priceAedFils: b.priceAedFilsAtSale,
      soldAt: b.soldAt ? b.soldAt.toISOString() : null,
      widthMm: b.widthMm,
      depthMm: b.depthMm,
    })),
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
