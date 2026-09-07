import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.description === "string") data.description = body.description;
  if (body.startDate) data.startDate = new Date(body.startDate);
  data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (typeof body.location === "string") data.location = body.location;
  data.coverImage = body.coverImage || null;
  if (Array.isArray(body.categories)) data.categories = body.categories.map(String).filter(Boolean);
  data.floorPlanImageUrl = body.floorPlanImageUrl || null;
  if (["DRAFT", "PUBLISHED", "CLOSED"].includes(body.status)) data.status = body.status;
  data.whatsappVendorGroupLink = body.whatsappVendorGroupLink || null;
  data.acceptanceDeadlineHours = body.acceptanceDeadlineHours ? Number(body.acceptanceDeadlineHours) : null;

  const event = await prisma.event.update({ where: { id }, data });
  return NextResponse.json({ ok: true, event });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
