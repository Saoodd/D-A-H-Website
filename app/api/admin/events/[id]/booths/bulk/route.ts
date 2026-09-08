import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

interface BulkBooth {
  code: string;
  size?: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  priceAedFils?: number | null;
  colorHex?: string | null;
}

// Bulk-paste the full booth list for an event (e.g. every A#/B# kiosk from
// the reference floor plan) instead of adding booths one at a time.
// Upserts by code: existing booths keep their status/holds, new ones are
// created as AVAILABLE.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const booths = body?.booths as BulkBooth[] | undefined;
  if (!Array.isArray(booths) || booths.length === 0) {
    return NextResponse.json({ error: "Provide a non-empty `booths` array." }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const b of booths) {
    const code = String(b.code || "").trim();
    const size = String(b.size || "custom").trim() || "custom";
    const gridX = Number(b.gridX);
    const gridY = Number(b.gridY);
    const gridW = Number(b.gridW);
    const gridH = Number(b.gridH);
    const priceAedFils = b.priceAedFils == null ? null : Math.round(Number(b.priceAedFils));
    const colorHex = b.colorHex ? String(b.colorHex).trim() : null;
    if (!code || [gridX, gridY, gridW, gridH].some((n) => Number.isNaN(n)) || (priceAedFils != null && Number.isNaN(priceAedFils))) {
      errors.push(`Skipped invalid row: ${JSON.stringify(b)}`);
      continue;
    }
    const existing = await prisma.booth.findUnique({ where: { eventId_code: { eventId: id, code } } });
    if (existing) {
      await prisma.booth.update({ where: { id: existing.id }, data: { size, gridX, gridY, gridW, gridH, priceAedFils, colorHex } });
      updated += 1;
    } else {
      await prisma.booth.create({ data: { eventId: id, code, size, gridX, gridY, gridW, gridH, priceAedFils, colorHex, status: "AVAILABLE" } });
      created += 1;
    }
  }

  return NextResponse.json({ ok: true, created, updated, errors });
}
