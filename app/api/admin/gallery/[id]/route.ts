import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.caption === "string") data.caption = body.caption;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  if (typeof body.url === "string" && body.url) data.url = body.url;
  const image = await prisma.galleryImage.update({ where: { id }, data });
  return NextResponse.json({ ok: true, image });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.galleryImage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
