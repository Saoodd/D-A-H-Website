import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { FEATURE_TYPE } from "@/lib/constants";

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

  if ([gridX, gridY, gridW, gridH].some((n) => Number.isNaN(n))) {
    return NextResponse.json({ error: "Grid position/size are required." }, { status: 400 });
  }

  const feature = await prisma.floorPlanFeature.create({
    data: { eventId: id, type, label, gridX, gridY, gridW, gridH, rotation },
  });

  return NextResponse.json({ ok: true, feature });
}
