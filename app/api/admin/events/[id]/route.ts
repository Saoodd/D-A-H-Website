import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // Partial-PATCH semantics throughout: only fields actually present in the
  // request body are touched, so callers that patch a single field (e.g. the
  // floor plan image upload/remove buttons) don't wipe the rest of the event.
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.description === "string") data.description = body.description;
  if (body.startDate) data.startDate = new Date(body.startDate);
  if ("endDate" in body) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (typeof body.location === "string") data.location = body.location;
  if ("coverImage" in body) data.coverImage = body.coverImage || null;
  if (Array.isArray(body.categories)) data.categories = body.categories.map(String).filter(Boolean);
  if ("floorPlanImageUrl" in body) data.floorPlanImageUrl = body.floorPlanImageUrl || null;
  if ("venueWidthM" in body) data.venueWidthM = body.venueWidthM ? Number(body.venueWidthM) : null;
  if ("showPublicPricing" in body) data.showPublicPricing = Boolean(body.showPublicPricing);
  if (["DRAFT", "PUBLISHED", "CLOSED"].includes(body.status)) data.status = body.status;
  if ("whatsappVendorGroupLink" in body) data.whatsappVendorGroupLink = body.whatsappVendorGroupLink || null;
  if ("acceptanceDeadlineHours" in body) {
    data.acceptanceDeadlineHours = body.acceptanceDeadlineHours ? Number(body.acceptanceDeadlineHours) : null;
  }

  const event = await prisma.event.update({ where: { id }, data });
  return NextResponse.json({ ok: true, event });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Payment records are financial history and must never be silently
  // destroyed as a side effect of deleting an event — Booth.payments has no
  // cascade from Booth, so a raw delete would otherwise fail with an opaque
  // foreign-key error (or worse, succeed and lose payment records) once an
  // event has any bookings. Block it with a clear reason instead.
  const paymentCount = await prisma.payment.count({ where: { eventId: id } });
  if (paymentCount > 0) {
    return NextResponse.json(
      { error: "This event has payment records on file and can't be deleted. Set it to Closed instead to keep the history intact." },
      { status: 409 }
    );
  }

  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
