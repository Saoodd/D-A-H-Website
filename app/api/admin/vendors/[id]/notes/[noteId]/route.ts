import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

// Notes are an append-only log by design — this only exists for the rare
// "added by mistake" correction, never for editing what a note says.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, noteId } = await params;
  const note = await prisma.vendorNote.findUnique({ where: { id: noteId } });
  if (!note || note.vendorId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.vendorNote.delete({ where: { id: noteId } });
  return NextResponse.json({ ok: true });
}
