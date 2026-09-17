import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { parseDxf } from "@/lib/cadImport";
import { hasConfirmedScale } from "@/lib/floorplan/transform";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB — generous for a booth floor-plan DXF (plain text)

// Parses an uploaded DXF file and returns detected booth candidates +
// architecture lines for the Import Preview screen. Does NOT write
// anything to the database — nothing is created until the admin reviews
// the preview and calls .../cad-import/commit. Never persists the raw
// file: it's only needed transiently to detect geometry.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: eventId } = await params;
  // Real xMm/yMm + a venue-boundary candidate are only meaningful once
  // this event has a confirmed physical scale to place them into — see
  // lib/cadImport.ts's `venue` option. Omitted entirely otherwise, which
  // keeps parseDxf's legacy percent-only behavior unchanged.
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { venueScaleConfirmed: true, venueWidthMm: true, venueDepthMm: true } });
  const venue = event && hasConfirmedScale(event) ? { widthMm: event.venueWidthMm, depthMm: event.venueDepthMm } : null;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large (10MB limit)." }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".dxf")) {
    return NextResponse.json(
      { error: "Only DXF files are supported for CAD import. DWG (AutoCAD's binary format) can't be parsed directly — export to DXF first (File > Save As > DXF in AutoCAD, or use a free converter)." },
      { status: 400 }
    );
  }

  const boothLayersRaw = form?.get("boothLayers");
  const boothLayers = typeof boothLayersRaw === "string" && boothLayersRaw.trim() ? boothLayersRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  let text: string;
  try {
    text = await file.text();
  } catch {
    return NextResponse.json({ error: "Couldn't read that file as text — confirm it's an ASCII DXF export, not binary DXF or DWG." }, { status: 400 });
  }

  try {
    const result = parseDxf(text, { boothLayers, venue });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't parse that DXF file." }, { status: 400 });
  }
}
