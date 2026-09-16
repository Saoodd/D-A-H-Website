import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getBoothPrice } from "@/lib/pricing";
import { BOOTH_STATUS } from "@/lib/constants";
import { notifyVendorWhatsApp } from "@/lib/notifications/notify";

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
  if (typeof body.code === "string" && body.code.trim()) {
    const code = body.code.trim();
    if (code !== booth.code) {
      const clash = await prisma.booth.findUnique({ where: { eventId_code: { eventId: booth.eventId, code } } });
      if (clash) return NextResponse.json({ error: `Booth ${code} already exists for this event.` }, { status: 409 });
    }
    data.code = code;
  }
  if (typeof body.size === "string" && body.size.trim()) {
    data.size = body.size.trim();
  }
  if ("priceAedFils" in body) {
    data.priceAedFils = body.priceAedFils == null ? null : Math.round(Number(body.priceAedFils));
  }
  if ("colorHex" in body) {
    data.colorHex = body.colorHex || null;
  }
  if ("widthMm" in body) {
    data.widthMm = body.widthMm == null || body.widthMm === "" ? null : Math.round(Number(body.widthMm));
  }
  if ("depthMm" in body) {
    data.depthMm = body.depthMm == null || body.depthMm === "" ? null : Math.round(Number(body.depthMm));
  }
  for (const key of ["gridX", "gridY", "gridW", "gridH"] as const) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isNaN(n)) data[key] = n;
    }
  }
  if (body.rotation !== undefined) {
    const n = Math.round(Number(body.rotation));
    if (!Number.isNaN(n)) data.rotation = ((n % 360) + 360) % 360;
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
      data.priceAedFilsAtSale = await getBoothPrice(
        {
          priceAedFils: "priceAedFils" in data ? (data.priceAedFils as number | null) : booth.priceAedFils,
          size: (data.size as string) || booth.size,
        },
        booth.eventId
      );
    }
    data.soldAt = booth.soldAt || new Date();
  } else if (data.status === "AVAILABLE") {
    data.assignedApplicationId = null;
    data.manualAssigneeName = null;
    data.priceAedFilsAtSale = null;
    data.soldAt = null;
  }

  const updated = await prisma.booth.update({ where: { id }, data });

  // BOOKING_UPDATED is intentional/opt-in only (spec: "never automatically
  // for tiny internal/admin-only edits") — fires ONLY when the admin
  // explicitly passes notifyVendor:true AND the booth was already a
  // confirmed SOLD booking whose assigned vendor is actually changing. A
  // cosmetic edit (price/color/geometry) on a SOLD booth, or a fresh
  // assignment on a booth that wasn't SOLD before this PATCH, never
  // triggers this — that's the normal admin floor-plan setup flow, not a
  // change to an existing vendor's confirmed booking.
  if (
    body.notifyVendor === true &&
    booth.status === "SOLD" &&
    updated.status === "SOLD" &&
    updated.assignedApplicationId &&
    updated.assignedApplicationId !== booth.assignedApplicationId
  ) {
    const application = await prisma.application.findUnique({ where: { id: updated.assignedApplicationId }, include: { event: true } });
    if (application) {
      const previousBoothCode = typeof body.previousBoothCode === "string" && body.previousBoothCode.trim() ? body.previousBoothCode.trim() : booth.code;
      await notifyVendorWhatsApp({
        useCase: "BOOKING_UPDATED",
        vendorId: application.vendorId,
        eventId: application.eventId,
        applicationId: application.id,
        entityId: `${updated.id}:${Date.now()}`,
        data: {
          business_name: application.businessName,
          event_name: application.event.name,
          booth_old: previousBoothCode,
          booth_new: updated.code,
        },
      });
    }
  }

  return NextResponse.json({ ok: true, booth: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await prisma.booth.delete({ where: { id } });
  } catch (err) {
    // Payment.boothId / PaymentBooth.boothId are ON DELETE RESTRICT — a
    // booth with real payment history can never be deleted, by design.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "This booth has payment history on file and can't be deleted." }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}
