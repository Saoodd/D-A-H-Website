import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const url = String(body.url || "").trim();
  if (!url) return NextResponse.json({ error: "Image URL is required." }, { status: 400 });

  const count = await prisma.galleryImage.count();
  const image = await prisma.galleryImage.create({
    data: { url, caption: String(body.caption || ""), sortOrder: count },
  });

  return NextResponse.json({ ok: true, image });
}
