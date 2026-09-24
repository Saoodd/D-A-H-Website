import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getBoothPrice } from "@/lib/pricing";
import { BOOTH_STATUS } from "@/lib/constants";
import { notifyVendorWhatsApp } from "@/lib/notifications/notify";
import { hasConfirmedScale, mmToGridRect, gridRectToMm } from "@/lib/floorplan/transform";
import { isFootprintWithinBoundary, parseVenueBoundary, BOUNDARY_VIOLATION_MESSAGE } from "@/lib/floorplan/boundary";

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
  if ("xMm" in body) {
    data.xMm = body.xMm == null || body.xMm === "" ? null : Math.round(Number(body.xMm));
  }
  if ("yMm" in body) {
    data.yMm = body.yMm == null || body.yMm === "" ? null : Math.round(Number(body.yMm));
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
  if (body.boundaryOverride !== undefined) {
    data.boundaryOverride = body.boundaryOverride === true;
  }

  // Server-authoritative geometry derivation (same pattern as booth create/
  // Mass Create): once this booth's event has a confirmed physical scale
  // and this PATCH actually touches geometry, gridX/Y/W/H are ALWAYS
  // re-derived from the effective real-world xMm/yMm/widthMm/depthMm —
  // never trusted verbatim from a resize/move/inspector-edit payload — so a
  // booth's rendered size can never drift out of proportion with its
  // declared physical dimensions. Falls through unchanged (legacy
  // behavior) when the event isn't scale-confirmed, or when this booth
  // doesn't yet have a full xMm/yMm/widthMm/depthMm set to derive from
  // (e.g. a pre-existing booth an admin hasn't recalibrated yet).
  const geometryTouched = ["gridX", "gridY", "gridW", "gridH", "xMm", "yMm", "widthMm", "depthMm"].some((k) => k in body);
  if (geometryTouched) {
    const event = await prisma.event.findUnique({
      where: { id: booth.eventId },
      select: { venueScaleConfirmed: true, venueWidthMm: true, venueDepthMm: true, venueShape: true, venueBoundaryJson: true },
    });
    if (event && hasConfirmedScale(event)) {
      const venueForGrid = { venueWidthMm: event.venueWidthMm, venueDepthMm: event.venueDepthMm };
      // The interactive canvas (drag/resize) still operates in grid/percent
      // space and PATCHes gridX/Y/W/H directly, NOT xMm/yMm/widthMm/depthMm.
      // When the caller sent grid fields without the corresponding mm
      // fields, that grid position/size IS the real new value the client
      // intends and must be converted to mm here — falling back to the
      // booth's STALE stored xMm/yMm/widthMm/depthMm whenever mm fields
      // weren't explicitly sent (as this block used to) silently discarded
      // every drag/resize on a scale-confirmed event: it re-derived gridX/Y
      // from the OLD position and clobbered the client's actual move with
      // it, a no-op the client could never observe.
      const anyGridFieldSent = ["gridX", "gridY", "gridW", "gridH"].some((k) => k in body);
      let derivedFromGrid: { xMm: number; yMm: number; widthMm: number; depthMm: number } | null = null;
      if (anyGridFieldSent) {
        const current = mmToGridRect(venueForGrid, {
          xMm: booth.xMm ?? 0,
          yMm: booth.yMm ?? 0,
          widthMm: booth.widthMm ?? 0,
          depthMm: booth.depthMm ?? 0,
        });
        derivedFromGrid = gridRectToMm(venueForGrid, {
          gridX: "gridX" in body ? Number(body.gridX) : current.gridX,
          gridY: "gridY" in body ? Number(body.gridY) : current.gridY,
          gridW: "gridW" in body ? Number(body.gridW) : current.gridW,
          gridH: "gridH" in body ? Number(body.gridH) : current.gridH,
        });
      }
      const effectiveXMm = ("xMm" in data ? (data.xMm as number | null) : null) ?? derivedFromGrid?.xMm ?? booth.xMm;
      const effectiveYMm = ("yMm" in data ? (data.yMm as number | null) : null) ?? derivedFromGrid?.yMm ?? booth.yMm;
      const effectiveWidthMm = ("widthMm" in data ? (data.widthMm as number | null) : null) ?? derivedFromGrid?.widthMm ?? booth.widthMm;
      const effectiveDepthMm = ("depthMm" in data ? (data.depthMm as number | null) : null) ?? derivedFromGrid?.depthMm ?? booth.depthMm;
      if (effectiveXMm != null && effectiveYMm != null && effectiveWidthMm != null && effectiveDepthMm != null) {
        const venue = { venueWidthMm: event.venueWidthMm, venueDepthMm: event.venueDepthMm };
        const boundaryOverride = "boundaryOverride" in data ? (data.boundaryOverride as boolean) : booth.boundaryOverride;
        const boundary = { widthMm: event.venueWidthMm, depthMm: event.venueDepthMm, boundary: parseVenueBoundary(event.venueShape, event.venueBoundaryJson) };
        const rotationDeg = body.rotation !== undefined ? (data.rotation as number) : booth.rotation;
        if (!boundaryOverride && !isFootprintWithinBoundary(boundary, { xMm: effectiveXMm, yMm: effectiveYMm, widthMm: effectiveWidthMm, depthMm: effectiveDepthMm, rotationDeg })) {
          return NextResponse.json({ error: BOUNDARY_VIOLATION_MESSAGE, code: "OUTSIDE_BOUNDARY" }, { status: 409 });
        }
        const grid = mmToGridRect(venue, { xMm: effectiveXMm, yMm: effectiveYMm, widthMm: effectiveWidthMm, depthMm: effectiveDepthMm });
        data.gridX = grid.gridX;
        data.gridY = grid.gridY;
        data.gridW = grid.gridW;
        data.gridH = grid.gridH;
        data.xMm = effectiveXMm;
        data.yMm = effectiveYMm;
        data.widthMm = effectiveWidthMm;
        data.depthMm = effectiveDepthMm;
      }
    }
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
