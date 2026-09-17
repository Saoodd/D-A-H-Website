import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { FEATURE_TYPE } from "@/lib/constants";
import { hasConfirmedScale, mmToGridRect, gridRectToMm } from "@/lib/floorplan/transform";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const type = (FEATURE_TYPE as readonly string[]).includes(body.type) ? body.type : "OTHER";
  const label = String(body.label || "").trim();
  const gridX = Number(body.gridX);
  const gridY = Number(body.gridY);
  const gridW = Number(body.gridW);
  const gridH = Number(body.gridH);
  const rotation = Number(body.rotation) || 0;
  const widthMm = body.widthMm == null || body.widthMm === "" ? null : Math.round(Number(body.widthMm));
  const depthMm = body.depthMm == null || body.depthMm === "" ? null : Math.round(Number(body.depthMm));
  const explicitXMm = body.xMm == null || body.xMm === "" ? null : Math.round(Number(body.xMm));
  const explicitYMm = body.yMm == null || body.yMm === "" ? null : Math.round(Number(body.yMm));

  if ([gridX, gridY, gridW, gridH].some((n) => Number.isNaN(n))) {
    return NextResponse.json({ error: "Grid position/size are required." }, { status: 400 });
  }

  // Same server-authoritative size/position derivation as Booth create (see
  // app/api/admin/events/[id]/booths/route.ts) — once this event's physical
  // scale is confirmed and real widthMm/depthMm are given, the rendered
  // gridX/Y/W/H are ALWAYS derived from real mm geometry, never trusted
  // verbatim from the client, so a feature's rendered size/position can
  // never drift out of proportion with its declared physical dimensions.
  let finalGrid = { gridX, gridY, gridW, gridH };
  let xMm: number | null = null;
  let yMm: number | null = null;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { venueScaleConfirmed: true, venueWidthMm: true, venueDepthMm: true },
  });
  if (event && hasConfirmedScale(event) && widthMm != null && depthMm != null) {
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
  }

  const feature = await prisma.floorPlanFeature.create({
    data: { eventId: id, type, label, ...finalGrid, rotation, widthMm, depthMm, xMm, yMm },
  });

  return NextResponse.json({ ok: true, feature });
}
