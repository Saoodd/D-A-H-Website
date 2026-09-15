import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

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

  const booth = await prisma.booth.create({
    data: { eventId: id, code, size, gridX, gridY, gridW, gridH, priceAedFils, colorHex, widthMm, depthMm, status: "AVAILABLE" },
  });

  return NextResponse.json({ ok: true, booth });
}
