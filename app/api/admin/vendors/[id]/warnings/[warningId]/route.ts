import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

const SEVERITIES = ["NOTICE", "WARNING", "FINAL_WARNING"];
const STATUSES = ["ACTIVE", "RESOLVED", "WITHDRAWN"];

// Admin sees the full record including adminNote. Warnings are never hard
// deleted — "issued by mistake" is handled by moving status to WITHDRAWN so
// the audit trail (who issued what, when) is preserved.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; warningId: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, warningId } = await params;
  const warning = await prisma.vendorWarning.findUnique({
    where: { id: warningId },
    include: { event: { select: { name: true, slug: true, startDate: true } } },
  });
  if (!warning || warning.vendorId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ warning });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; warningId: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, warningId } = await params;
  const existing = await prisma.vendorWarning.findUnique({ where: { id: warningId } });
  if (!existing || existing.vendorId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if ("title" in body) {
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    data.title = title;
  }
  if ("description" in body) {
    const description = String(body.description || "").trim();
    if (!description) return NextResponse.json({ error: "Description cannot be empty." }, { status: 400 });
    data.description = description;
  }
  if ("severity" in body) {
    if (!SEVERITIES.includes(body.severity)) return NextResponse.json({ error: "Invalid severity." }, { status: 400 });
    data.severity = body.severity;
  }
  if ("adminNote" in body) {
    data.adminNote = body.adminNote ? String(body.adminNote).trim() : null;
  }
  if ("eventId" in body) {
    if (body.eventId) {
      const event = await prisma.event.findUnique({ where: { id: body.eventId } });
      if (!event) return NextResponse.json({ error: "That event doesn't exist." }, { status: 400 });
      data.eventId = event.id;
    } else {
      data.eventId = null;
    }
  }
  if ("status" in body) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    data.status = body.status;
    if (body.status === "RESOLVED" || body.status === "WITHDRAWN") {
      data.resolvedAt = existing.resolvedAt ?? new Date();
    } else if (body.status === "ACTIVE") {
      data.resolvedAt = null;
    }
  }

  const warning = await prisma.vendorWarning.update({ where: { id: warningId }, data });
  return NextResponse.json({ ok: true, warning });
}
