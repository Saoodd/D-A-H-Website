import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { FEATURE_TYPE } from "@/lib/constants";
import { hasConfirmedScale, mmToGridRect } from "@/lib/floorplan/transform";

// Features are placed once with a fixed size (see the create route) and
// only ever repositioned/rotated/relabeled afterward — this route never
// touches widthMm/depthMm/gridW/gridH, unlike the booth PATCH route.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const feature = await prisma.floorPlanFeature.findUnique({ where: { id } });
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.label === "string") data.label = body.label.trim();
  if ((FEATURE_TYPE as readonly string[]).includes(body.type)) data.type = body.type;
  if (body.rotation !== undefined) {
    const n = Math.round(Number(body.rotation));
    if (!Number.isNaN(n)) data.rotation = ((n % 360) + 360) % 360;
  }

  // Mirrors the booth PATCH route's contract: gridX/gridY are ALWAYS
  // 0-100 percentages server-side (legacy mode, or a not-yet-repositioned
  // MM-mode feature); the client sends explicit xMm/yMm instead once scale
  // is confirmed (see FloorPlanBuilder's worldPatchToServerPatch usage) —
  // never a real mm value under the "gridX" key.
  const explicitXMm = body.xMm == null || body.xMm === "" ? null : Math.round(Number(body.xMm));
  const explicitYMm = body.yMm == null || body.yMm === "" ? null : Math.round(Number(body.yMm));
  if (explicitXMm != null && explicitYMm != null) {
    const event = await prisma.event.findUnique({
      where: { id: feature.eventId },
      select: { venueScaleConfirmed: true, venueWidthMm: true, venueDepthMm: true },
    });
    if (event && hasConfirmedScale(event) && feature.widthMm != null && feature.depthMm != null) {
      const venue = { venueWidthMm: event.venueWidthMm, venueDepthMm: event.venueDepthMm };
      const grid = mmToGridRect(venue, { xMm: explicitXMm, yMm: explicitYMm, widthMm: feature.widthMm, depthMm: feature.depthMm });
      data.xMm = explicitXMm;
      data.yMm = explicitYMm;
      data.gridX = grid.gridX;
      data.gridY = grid.gridY;
    }
  } else {
    if ("gridX" in body) {
      const n = Number(body.gridX);
      if (!Number.isNaN(n)) data.gridX = n;
    }
    if ("gridY" in body) {
      const n = Number(body.gridY);
      if (!Number.isNaN(n)) data.gridY = n;
    }
  }

  const updated = await prisma.floorPlanFeature.update({ where: { id }, data });
  return NextResponse.json({ ok: true, feature: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.floorPlanFeature.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
