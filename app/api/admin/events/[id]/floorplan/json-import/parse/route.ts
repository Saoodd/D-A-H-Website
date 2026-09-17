import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { parseFloorplanImportJson } from "@/lib/floorplanImport";
import { hasConfirmedScale, mmToGridRect } from "@/lib/floorplan/transform";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — generous for a booth-list JSON file

// Validates a "DAH Floor Plan JSON" (see lib/floorplanImport.ts) against
// the version-1 schema, then converts its mm-first booths into the exact
// row shape .../cad-import/commit already expects (code/gridX/Y/W/H/
// rotation/widthMm/depthMm/xMm/yMm) — reusing that route's safe-reimport
// modes (newOnly/matchUpdate/replace) and boundary check rather than a
// second commit implementation. Does NOT write anything to the database
// itself; nothing is created until the admin reviews the preview and
// posts to .../cad-import/commit.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "Paste or upload a DAH Floor Plan JSON file first." }, { status: 400 });
  }
  if (text.length > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large (5MB limit)." }, { status: 400 });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { venueScaleConfirmed: true, venueWidthMm: true, venueDepthMm: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (!hasConfirmedScale(event)) {
    return NextResponse.json(
      { error: "This event doesn't have a confirmed physical scale yet — confirm it in Floor Plan → Physical Scale before importing a mm-based JSON layout." },
      { status: 400 }
    );
  }
  const venue = { venueWidthMm: event.venueWidthMm, venueDepthMm: event.venueDepthMm };

  const result = parseFloorplanImportJson(text);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const warnings: string[] = [];
  if (result.doc.venue) {
    const wOff = Math.abs(result.doc.venue.widthMm - venue.venueWidthMm) / venue.venueWidthMm;
    const dOff = Math.abs(result.doc.venue.depthMm - venue.venueDepthMm) / venue.venueDepthMm;
    if (wOff > 0.01 || dOff > 0.01) {
      warnings.push(
        `This file's "venue" size (${(result.doc.venue.widthMm / 1000).toFixed(1)}m × ${(result.doc.venue.depthMm / 1000).toFixed(1)}m) doesn't match this event's declared venue size (${(venue.venueWidthMm / 1000).toFixed(1)}m × ${(venue.venueDepthMm / 1000).toFixed(1)}m) — booth positions below are still taken literally as mm within THIS event's venue, not rescaled.`
      );
    }
  }

  const outOfBounds: string[] = [];
  const rows = result.doc.booths.map((b) => {
    const grid = mmToGridRect(venue, { xMm: b.xMm, yMm: b.yMm, widthMm: b.widthMm, depthMm: b.depthMm });
    if (grid.gridX < 0 || grid.gridY < 0 || grid.gridX + grid.gridW > 100 || grid.gridY + grid.gridH > 100) {
      outOfBounds.push(b.code);
    }
    return {
      entityId: b.code,
      code: b.code,
      labelConfidence: "matched" as const,
      gridX: grid.gridX,
      gridY: grid.gridY,
      gridW: grid.gridW,
      gridH: grid.gridH,
      rotation: b.rotation ?? 0,
      widthMm: b.widthMm,
      depthMm: b.depthMm,
      xMm: b.xMm,
      yMm: b.yMm,
    };
  });
  if (outOfBounds.length > 0) {
    warnings.push(`${outOfBounds.length} booth${outOfBounds.length === 1 ? "" : "s"} fall outside this event's venue coordinate box entirely: ${outOfBounds.join(", ")}. They'll be rejected by the boundary check on import unless corrected.`);
  }

  return NextResponse.json({ ok: true, rows, warnings });
}
