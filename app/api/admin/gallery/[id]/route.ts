import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { deleteBlobIfOwned } from "@/lib/uploadSafety";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.caption === "string") data.caption = body.caption;
  if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
  if (typeof body.url === "string" && body.url) data.url = body.url;

  const previous = "url" in data ? await prisma.galleryImage.findUnique({ where: { id }, select: { url: true } }) : null;
  const image = await prisma.galleryImage.update({ where: { id }, data });
  if (previous && previous.url && previous.url !== data.url) {
    await deleteBlobIfOwned(previous.url);
  }

  return NextResponse.json({ ok: true, image });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const image = await prisma.galleryImage.delete({ where: { id } });
  await deleteBlobIfOwned(image.url);
  return NextResponse.json({ ok: true });
}
