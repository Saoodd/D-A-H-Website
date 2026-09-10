import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { sendWarningEmail } from "@/lib/email";

const SEVERITIES = ["NOTICE", "WARNING", "FINAL_WARNING"];

// Admin sees everything, including adminNote — the vendor-facing
// /api/vendor/warnings route never selects that field, so this is the only
// place it's ever returned.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const warnings = await prisma.vendorWarning.findMany({
    where: { vendorId: id },
    include: { event: { select: { name: true, slug: true, startDate: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ warnings });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const severity = SEVERITIES.includes(body.severity) ? body.severity : "NOTICE";
  if (!title || !description) {
    return NextResponse.json({ error: "Title and description are required." }, { status: 400 });
  }

  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let eventId: string | null = null;
  if (body.eventId) {
    const event = await prisma.event.findUnique({ where: { id: body.eventId } });
    if (!event) return NextResponse.json({ error: "That event doesn't exist." }, { status: 400 });
    eventId = event.id;
  }

  const warning = await prisma.vendorWarning.create({
    data: {
      vendorId: id,
      eventId,
      title,
      description,
      severity,
      adminNote: body.adminNote ? String(body.adminNote).trim() : null,
    },
  });

  // Only title/description/severity — exactly what's vendor-visible on
  // this row — ever reach the email. adminNote never leaves this route.
  // dedupeKey is the warning's own id, which is assigned exactly once at
  // creation, so a retried request can never send this twice.
  const event = eventId ? await prisma.event.findUnique({ where: { id: eventId }, select: { name: true } }) : null;
  await sendWarningEmail({
    vendorId: vendor.id,
    vendorEmail: vendor.email,
    businessName: vendor.businessName,
    title,
    description,
    severity,
    eventName: event?.name ?? null,
    dedupeKey: `warning:${warning.id}`,
  });

  return NextResponse.json({ ok: true, warning });
}
