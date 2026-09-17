import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";
import { getEventPricingTiers } from "@/lib/pricing";
import { getAllowMultipleBooths } from "@/lib/settings";

// Approved-vendor-only: never expose full booth-level detail to the public.
// A vendor may only view the floor plan for an event they have an
// ACCEPTED or already-PAID application for.
export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { eventId } = await params;
  const applicationId = req.nextUrl.searchParams.get("applicationId");
  if (!applicationId) return NextResponse.json({ error: "applicationId required" }, { status: 400 });

  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application || application.vendorId !== session.vendorId || application.eventId !== eventId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await runExpiryPass(eventId);

  const refreshed = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  const hasPaid = await prisma.payment.findFirst({ where: { applicationId, status: "SUCCEEDED" } });

  if (refreshed.status !== "ACCEPTED" && !hasPaid) {
    return NextResponse.json({ error: "Booth selection is not available for this application." }, { status: 403 });
  }

  const [features, booths, tiers, event] = await Promise.all([
    prisma.floorPlanFeature.findMany({ where: { eventId } }),
    prisma.booth.findMany({ where: { eventId } }),
    getEventPricingTiers(eventId),
    prisma.event.findUnique({
      where: { id: eventId },
      select: {
        floorPlanImageUrl: true,
        allowMultipleBooths: true,
        venueScaleConfirmed: true,
        venueWidthMm: true,
        venueDepthMm: true,
        venueBackgroundNaturalWidthPx: true,
        venueBackgroundNaturalHeightPx: true,
        venueBackgroundOffsetXMm: true,
        venueBackgroundOffsetYMm: true,
        venueBackgroundScale: true,
        venueBackgroundRotationDeg: true,
      },
    }),
  ]);

  return NextResponse.json({
    features,
    floorPlanImageUrl: event?.floorPlanImageUrl ?? null,
    allowMultipleBooths: await getAllowMultipleBooths(event?.allowMultipleBooths ?? null),
    // Real venue geometry (see lib/floorplan/transform.ts) — the same
    // fields the admin builder and View Booking's Fit-Venue view use, now
    // also reaching the vendor's own booth-selection map for the first
    // time (previously LEGACY_PERCENT-only regardless of confirmed scale).
    venueScaleConfirmed: event?.venueScaleConfirmed ?? false,
    venueWidthMm: event?.venueWidthMm ?? null,
    venueDepthMm: event?.venueDepthMm ?? null,
    venueBackgroundNaturalWidthPx: event?.venueBackgroundNaturalWidthPx ?? null,
    venueBackgroundNaturalHeightPx: event?.venueBackgroundNaturalHeightPx ?? null,
    venueBackgroundOffsetXMm: event?.venueBackgroundOffsetXMm ?? null,
    venueBackgroundOffsetYMm: event?.venueBackgroundOffsetYMm ?? null,
    venueBackgroundScale: event?.venueBackgroundScale ?? null,
    venueBackgroundRotationDeg: event?.venueBackgroundRotationDeg ?? 0,
    setupWidthMm: refreshed.setupWidthMm,
    setupDepthMm: refreshed.setupDepthMm,
    booths: booths.map((b) => ({
      id: b.id,
      code: b.code,
      size: b.size,
      status: b.status,
      gridX: b.gridX,
      gridY: b.gridY,
      gridW: b.gridW,
      gridH: b.gridH,
      rotation: b.rotation,
      colorHex: b.colorHex,
      priceAedFils: b.priceAedFils,
      widthMm: b.widthMm,
      depthMm: b.depthMm,
      xMm: b.xMm,
      yMm: b.yMm,
      isMine: b.heldByApplicationId === applicationId || b.assignedApplicationId === applicationId,
      holdExpiresAt:
        b.heldByApplicationId === applicationId && b.holdExpiresAt ? b.holdExpiresAt.toISOString() : null,
      holdStage: b.heldByApplicationId === applicationId ? b.holdStage : null,
    })),
    tiers: tiers.map((t) => ({ sizeKey: t.sizeKey, label: t.label, priceAedFils: t.priceAedFils, vatInclusive: t.vatInclusive })),
  });
}
