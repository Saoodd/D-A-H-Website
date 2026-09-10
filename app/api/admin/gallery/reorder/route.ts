import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

// Persists a full new gallery order in one request (drag-and-drop drop
// handler) instead of firing one PATCH per moved image — the public
// Gallery page and homepage preview both already sort by this same
// sortOrder field, so no change needed on the read side.
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const orderedIds: string[] | null = Array.isArray(body.orderedIds)
    ? body.orderedIds.filter((id: unknown): id is string => typeof id === "string")
    : null;
  if (!orderedIds || orderedIds.length === 0) {
    return NextResponse.json({ error: "orderedIds is required." }, { status: 400 });
  }

  await prisma.$transaction(orderedIds.map((id: string, index: number) => prisma.galleryImage.update({ where: { id }, data: { sortOrder: index } })));
  return NextResponse.json({ ok: true });
}
