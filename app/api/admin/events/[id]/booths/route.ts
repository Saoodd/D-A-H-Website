import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { hasConfirmedScale, mmToGridRect, gridRectToMm } from "@/lib/floorplan/transform";
import { isFootprintWithinBoundary, parseVenueBoundary, BOUNDARY_VIOLATION_MESSAGE } from "@/lib/floorplan/boundary";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").trim();
  const size = String(body.size || "custom").trim() || "custom";
  const gridX = Number(body.gridX);
  const gridY = Number(body.gridY);
  const gridW = Number(body.gridW);
  const gridH = Number(body.gridH);
  const priceAedFils =
    body.priceAedFils == null || body.priceAedFils === "" ? null : Math.round(Number(body.priceAedFils));
  const colorHex = body.colorHex ? String(body.colorHex).trim() : null;
  const widthMm = body.widthMm == null || body.widthMm === "" ? null : Math.round(Number(body.widthMm));
  const depthMm = body.depthMm == null || body.depthMm === "" ? null : Math.round(Number(body.depthMm));
  // Explicit real-world position, sent directly by a caller that's already
  // operating in mm-native coordinate space (the admin builder once its
  // event has a confirmed scale) — preferred over back-computing from
  // gridX/gridY (which only makes sense as a 0-100 percentage) when present.
  const explicitXMm = body.xMm == null || body.xMm === "" ? null : Math.round(Number(body.xMm));
  const explicitYMm = body.yMm == null || body.yMm === "" ? null : Math.round(Number(body.yMm));
  const boundaryOverride = body.boundaryOverride === true;

  if (!code || [gridX, gridY, gridW, gridH].some((n) => Number.isNaN(n))) {
    return NextResponse.json({ error: "code and grid position/size are required." }, { status: 400 });
  }
  if (priceAedFils != null && Number.isNaN(priceAedFils)) {
    return NextResponse.json({ error: "Invalid price." }, { status: 400 });
  }
  if ((widthMm != null && Number.isNaN(widthMm)) || (depthMm != null && Number.isNaN(depthMm))) {
    return NextResponse.json({ error: "Invalid booth dimensions." }, { status: 400 });
  }

  const existing = await prisma.booth.findUnique({ where: { eventId_code: { eventId: id, code } } });
  if (existing) return NextResponse.json({ error: `Booth ${code} already exists for this event.` }, { status: 409 });

  const event = await prisma.event.findUnique({
    where: { id },
    select: { venueScaleConfirmed: true, venueWidthMm: true, venueDepthMm: true, venueShape: true, venueBoundaryJson: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  // Same server-authoritative size derivation as Mass Create (see that
  // route's comment): once this event has a confirmed physical scale, the
  // rendered rectangle (gridW/gridH) is ALWAYS derived from the real
  // widthMm/depthMm, never trusted verbatim from the client's placement-
  // click default box — this is what stops a click-to-place booth from
  // rendering as a fixed-size square regardless of its declared dimensions.
  let finalGrid = { gridX, gridY, gridW, gridH };
  let xMm: number | null = null;
  let yMm: number | null = null;
  if (hasConfirmedScale(event) && widthMm != null && depthMm != null) {
    const venue = { venueWidthMm: event.venueWidthMm, venueDepthMm: event.venueDepthMm };
    if (explicitXMm != null && explicitYMm != null) {
      xMm = explicitXMm;
      yMm = explicitYMm;
    } else {
      const approxMm = gridRectToMm(venue, { gridX, gridY, gridW, gridH });
      xMm = approxMm.xMm;
      yMm = approxMm.yMm;
    }
    finalGrid = mmToGridRect(venue, { xMm, yMm, widthMm, depthMm });

    const boundary = { widthMm: event.venueWidthMm, depthMm: event.venueDepthMm, boundary: parseVenueBoundary(event.venueShape, event.venueBoundaryJson) };
    if (!boundaryOverride && !isFootprintWithinBoundary(boundary, { xMm, yMm, widthMm, depthMm, rotationDeg: 0 })) {
      return NextResponse.json({ error: BOUNDARY_VIOLATION_MESSAGE, code: "OUTSIDE_BOUNDARY" }, { status: 409 });
    }
  }

  const booth = await prisma.booth.create({
    data: {
      eventId: id,
      code,
      size,
      gridX: finalGrid.gridX,
      gridY: finalGrid.gridY,
      gridW: finalGrid.gridW,
      gridH: finalGrid.gridH,
      xMm,
      yMm,
      priceAedFils,
      colorHex,
      widthMm,
      depthMm,
      boundaryOverride,
      status: "AVAILABLE",
    },
  });

  return NextResponse.json({ ok: true, booth });
}
