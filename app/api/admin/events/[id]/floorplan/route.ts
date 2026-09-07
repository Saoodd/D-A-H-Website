import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { runExpiryPass } from "@/lib/expiry";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await runExpiryPass(id);

  const [features, booths, applications] = await Promise.all([
    prisma.floorPlanFeature.findMany({ where: { eventId: id } }),
    prisma.booth.findMany({
      where: { eventId: id },
      include: { assignedApplication: true, heldByApplication: true },
    }),
    prisma.application.findMany({
      where: { eventId: id, status: "ACCEPTED" },
      select: { id: true, businessName: true },
    }),
  ]);

  return NextResponse.json({
    features,
    booths: booths.map((b) => ({
      id: b.id,
      code: b.code,
      size: b.size,
      status: b.status,
      gridX: b.gridX,
      gridY: b.gridY,
      gridW: b.gridW,
      gridH: b.gridH,
      holdStage: b.holdStage,
      holdExpiresAt: b.holdExpiresAt ? b.holdExpiresAt.toISOString() : null,
      heldBy: b.heldByApplication?.businessName || null,
      occupant: b.assignedApplication
        ? { applicationId: b.assignedApplication.id, name: b.assignedApplication.businessName }
        : b.manualAssigneeName
        ? { applicationId: null, name: b.manualAssigneeName }
        : null,
      priceAedFilsAtSale: b.priceAedFilsAtSale,
    })),
    acceptedApplications: applications,
  });
}
