import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { hasConfirmedScale, mmToGridRect, gridRectToMm } from "@/lib/floorplan/transform";
import { isFootprintWithinBoundary, parseVenueBoundary, BOUNDARY_VIOLATION_MESSAGE } from "@/lib/floorplan/boundary";

const MAX_MASS_CREATE = 500; // sane ceiling — floor plans run to a few hundred booths at most

interface MassCreateRow {
  code: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  boundaryOverride?: boolean;
}

// Creates many booths at once from a generated code list (e.g. B1..B67),
// all sharing the same starting tier/size/price/color, placed in a simple
// non-overlapping row/grid layout so they never land stacked on top of one
// another — Admin repositions them afterward with the existing drag/align/
// group-move tools (see FloorPlanBuilder), same as any other booth.
//
// Every generated booth is created through the exact same Booth model as a
// manually-added or CAD-imported one — no parallel "mass-created booth"
// type exists.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: eventId } = await params;
  const body = await req.json().catch(() => ({}));

  const rows: MassCreateRow[] = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "Nothing to create." }, { status: 400 });
  }
  if (rows.length > MAX_MASS_CREATE) {
    return NextResponse.json({ error: `Mass create is limited to ${MAX_MASS_CREATE} booths at a time.` }, { status: 400 });
  }

  const codes = rows.map((r) => String(r.code || "").trim());
  if (codes.some((c) => !c)) {
    return NextResponse.json({ error: "Every generated booth needs a code." }, { status: 400 });
  }
  const dupeWithinRequest = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dupeWithinRequest) {
    return NextResponse.json({ error: `Duplicate code in this batch: ${dupeWithinRequest}` }, { status: 400 });
  }

  const size = String(body.size || "custom").trim() || "custom";
  const priceAedFils = body.priceAedFils == null || body.priceAedFils === "" ? null : Math.round(Number(body.priceAedFils));
  const colorHex = body.colorHex ? String(body.colorHex).trim() : null;
  const widthMm = body.widthMm == null || body.widthMm === "" ? null : Math.round(Number(body.widthMm));
  const depthMm = body.depthMm == null || body.depthMm === "" ? null : Math.round(Number(body.depthMm));
  const status = body.status === "AVAILABLE" ? "AVAILABLE" : "AVAILABLE"; // mass-created booths always start Available

  if (priceAedFils != null && (Number.isNaN(priceAedFils) || priceAedFils < 0)) {
    return NextResponse.json({ error: "Invalid price." }, { status: 400 });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { venueScaleConfirmed: true, venueWidthMm: true, venueDepthMm: true, venueShape: true, venueBoundaryJson: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  // Root-cause fix for the historical "Mass Create ignores entered
  // width/depth" bug: once this event has a confirmed physical scale, the
  // SERVER — never the client — derives gridW/gridH (the actual rendered
  // rectangle size) from the real widthMm/depthMm via mmToGridRect. A
  // client-sent gridW/gridH is only ever trusted as a fallback for events
  // that predate physical-scale configuration (see hasConfirmedScale),
  // matching every existing booth's current behavior exactly. Position
  // (gridX/gridY, i.e. the admin's chosen layout) still comes from the
  // client's placement algorithm (row/grid/columns), converted to xMm/yMm
  // for storage so it round-trips as real geometry too.
  const scaleConfirmed = hasConfirmedScale(event);
  const boundary = scaleConfirmed
    ? { widthMm: event.venueWidthMm, depthMm: event.venueDepthMm, boundary: parseVenueBoundary(event.venueShape, event.venueBoundaryJson) }
    : null;

  function deriveRowGeometry(r: MassCreateRow): { gridX: number; gridY: number; gridW: number; gridH: number; xMm: number | null; yMm: number | null; blocked: boolean } {
    if (!scaleConfirmed || widthMm == null || depthMm == null) {
      return { gridX: r.gridX, gridY: r.gridY, gridW: r.gridW, gridH: r.gridH, xMm: null, yMm: null, blocked: false };
    }
    const venue = { venueWidthMm: event!.venueWidthMm!, venueDepthMm: event!.venueDepthMm! };
    // The client's gridX/gridY (its chosen row/grid placement) is the
    // authoritative POSITION intent — converted to real mm here, then the
    // true widthMm/depthMm (never the client's gridW/gridH) become the
    // authoritative SIZE, and both are re-derived back into gridX/Y/W/H so
    // the legacy percentage fields stay perfectly in sync with real mm.
    const approxMm = gridRectToMm(venue, { gridX: r.gridX, gridY: r.gridY, gridW: r.gridW, gridH: r.gridH });
    const xMm = approxMm.xMm;
    const yMm = approxMm.yMm;
    const grid = mmToGridRect(venue, { xMm, yMm, widthMm, depthMm });
    const blocked = !r.boundaryOverride && boundary != null && !isFootprintWithinBoundary(boundary, { xMm, yMm, widthMm, depthMm, rotationDeg: 0 });
    return { gridX: grid.gridX, gridY: grid.gridY, gridW: grid.gridW, gridH: grid.gridH, xMm, yMm, blocked };
  }

  const geometry = rows.map((r) => ({ code: r.code.trim(), ...deriveRowGeometry(r) }));
  const outOfBoundary = geometry.filter((g) => g.blocked).map((g) => g.code);
  const placeable = geometry.filter((g) => !g.blocked);

  const existing = await prisma.booth.findMany({ where: { eventId, code: { in: codes } }, select: { code: true } });
  const conflictCodes = new Set(existing.map((b) => b.code));
  const skipConflicts = body.skipConflicts === true;
  if (conflictCodes.size > 0 && !skipConflicts) {
    return NextResponse.json(
      { error: "Some booth codes already exist for this event.", code: "DUPLICATE_CODES", duplicateCodes: Array.from(conflictCodes) },
      { status: 409 }
    );
  }

  const finalRows = placeable.filter((g) => !conflictCodes.has(g.code));

  const created = await prisma.booth.createMany({
    data: finalRows.map((g) => ({
      eventId,
      code: g.code,
      size,
      priceAedFils,
      colorHex,
      widthMm,
      depthMm,
      xMm: g.xMm,
      yMm: g.yMm,
      status,
      gridX: g.gridX,
      gridY: g.gridY,
      gridW: g.gridW,
      gridH: g.gridH,
    })),
  });

  return NextResponse.json({
    ok: true,
    created: created.count,
    skipped: conflictCodes.size,
    skippedCodes: Array.from(conflictCodes),
    outOfBoundary,
    outOfBoundaryMessage: outOfBoundary.length > 0 ? BOUNDARY_VIOLATION_MESSAGE : null,
  });
}
