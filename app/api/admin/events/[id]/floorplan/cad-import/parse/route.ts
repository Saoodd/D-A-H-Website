import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { parseDxf } from "@/lib/cadImport";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB — generous for a booth floor-plan DXF (plain text)

// Parses an uploaded DXF file and returns detected booth candidates +
// architecture lines for the Import Preview screen. Does NOT write
// anything to the database — nothing is created until the admin reviews
// the preview and calls .../cad-import/commit. Never persists the raw
// file: it's only needed transiently to detect geometry.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await params; // eventId isn't needed for parsing itself — kept for route symmetry with commit

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
    const result = parseDxf(text, { boothLayers });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't parse that DXF file." }, { status: 400 });
  }
}
