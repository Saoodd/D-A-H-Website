import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

const MAX_MASS_CREATE = 500; // sane ceiling — floor plans run to a few hundred booths at most

interface MassCreateRow {
  code: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
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

  const existing = await prisma.booth.findMany({ where: { eventId, code: { in: codes } }, select: { code: true } });
  if (existing.length > 0) {
    const skipConflicts = body.skipConflicts === true;
    const conflictCodes = new Set(existing.map((b) => b.code));
    if (!skipConflicts) {
      return NextResponse.json(
        { error: "Some booth codes already exist for this event.", code: "DUPLICATE_CODES", duplicateCodes: Array.from(conflictCodes) },
        { status: 409 }
      );
    }
    // Caller explicitly chose "skip conflicts" — drop those rows and create the rest.
    const filteredRows = rows.filter((r) => !conflictCodes.has(String(r.code).trim()));
    const created = await prisma.booth.createMany({
      data: filteredRows.map((r) => ({
        eventId,
        code: String(r.code).trim(),
        size,
        priceAedFils,
        colorHex,
        widthMm,
        depthMm,
        status,
        gridX: r.gridX,
        gridY: r.gridY,
        gridW: r.gridW,
        gridH: r.gridH,
      })),
    });
    return NextResponse.json({ ok: true, created: created.count, skipped: conflictCodes.size, skippedCodes: Array.from(conflictCodes) });
  }

  const created = await prisma.booth.createMany({
    data: rows.map((r) => ({
      eventId,
      code: r.code.trim(),
      size,
      priceAedFils,
      colorHex,
      widthMm,
      depthMm,
      status,
      gridX: r.gridX,
      gridY: r.gridY,
      gridW: r.gridW,
      gridH: r.gridH,
    })),
  });

  return NextResponse.json({ ok: true, created: created.count, skipped: 0, skippedCodes: [] });
}
