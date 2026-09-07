import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getPriceForSize } from "@/lib/pricing";
import { BOOTH_STATUS } from "@/lib/constants";

// Admin booth management: manual status changes, assign/reassign to a
// specific approved vendor (or a free-text walk-in name), and unassign back
// to available. No timer involved — this always clears any vendor-side
// system hold on the booth.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const booth = await prisma.booth.findUnique({ where: { id } });
  if (!booth) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {
    heldByApplicationId: null,
    holdStage: null,
    holdExpiresAt: null,
  };

  if (body.status && (BOOTH_STATUS as readonly string[]).includes(body.status)) {
    data.status = body.status;
  }
  if ("assignedApplicationId" in body) {
    if (body.assignedApplicationId) {
      const app = await prisma.application.findUnique({ where: { id: body.assignedApplicationId } });
      if (!app || app.eventId !== booth.eventId) {
        return NextResponse.json({ error: "That application does not belong to this event." }, { status: 400 });
      }
      data.assignedApplicationId = body.assignedApplicationId;
      data.manualAssigneeName = null;
    } else {
      data.assignedApplicationId = null;
    }
  }
  if ("manualAssigneeName" in body) {
    data.manualAssigneeName = body.manualAssigneeName || null;
    if (body.manualAssigneeName) data.assignedApplicationId = null;
  }

  if (data.status === "SOLD") {
    if (!booth.priceAedFilsAtSale) {
      data.priceAedFilsAtSale = await getPriceForSize(booth.size);
    }
    data.soldAt = booth.soldAt || new Date();
  } else if (data.status === "AVAILABLE") {
    data.assignedApplicationId = null;
    data.manualAssigneeName = null;
    data.priceAedFilsAtSale = null;
    data.soldAt = null;
  }

  const updated = await prisma.booth.update({ where: { id }, data });
  return NextResponse.json({ ok: true, booth: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.booth.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
