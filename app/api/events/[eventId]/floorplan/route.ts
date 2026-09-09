import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";
import { getEventPricingTiers } from "@/lib/pricing";

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
    prisma.event.findUnique({ where: { id: eventId }, select: { floorPlanImageUrl: true } }),
  ]);

  return NextResponse.json({
    features,
    floorPlanImageUrl: event?.floorPlanImageUrl ?? null,
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
      isMine: b.heldByApplicationId === applicationId || b.assignedApplicationId === applicationId,
      holdExpiresAt:
        b.heldByApplicationId === applicationId && b.holdExpiresAt ? b.holdExpiresAt.toISOString() : null,
      holdStage: b.heldByApplicationId === applicationId ? b.holdStage : null,
    })),
    tiers: tiers.map((t) => ({ sizeKey: t.sizeKey, label: t.label, priceAedFils: t.priceAedFils, vatInclusive: t.vatInclusive })),
  });
}
