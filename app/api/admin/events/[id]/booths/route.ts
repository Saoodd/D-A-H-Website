import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").trim();
  const size = String(body.size || "").trim();
  const gridX = Number(body.gridX);
  const gridY = Number(body.gridY);
  const gridW = Number(body.gridW);
  const gridH = Number(body.gridH);

  if (!code || !size || [gridX, gridY, gridW, gridH].some((n) => Number.isNaN(n))) {
    return NextResponse.json({ error: "code, size and grid position/size are required." }, { status: 400 });
  }

  const existing = await prisma.booth.findUnique({ where: { eventId_code: { eventId: id, code } } });
  if (existing) return NextResponse.json({ error: `Booth ${code} already exists for this event.` }, { status: 409 });

  const booth = await prisma.booth.create({
    data: { eventId: id, code, size, gridX, gridY, gridW, gridH, status: "AVAILABLE" },
  });

  return NextResponse.json({ ok: true, booth });
}
