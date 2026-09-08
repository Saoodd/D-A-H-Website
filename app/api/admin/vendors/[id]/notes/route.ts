import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

// Private DAH-internal notes — this whole route tree is admin-only and
// nothing here is ever reachable from a vendor-facing route.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const notes = await prisma.vendorNote.findMany({ where: { vendorId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const note = String(body.note || "").trim();
  if (!note) return NextResponse.json({ error: "Note text is required." }, { status: 400 });

  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const created = await prisma.vendorNote.create({ data: { vendorId: id, note } });
  return NextResponse.json({ ok: true, note: created });
}
