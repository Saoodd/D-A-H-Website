import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getPublishedAgreement } from "@/lib/agreements";
import { deletePublicBlobIfOwned } from "@/lib/blob";

// Duplicating an event can carry the SAME floorPlanImageUrl into a new
// Event row (see POST /api/admin/events) — so before deleting a blob this
// route must confirm no OTHER event still points at that exact URL.
async function deleteEventImageIfUnshared(url: string | null | undefined, excludeEventId: string) {
  if (!url) return;
  const stillReferenced = await prisma.event.count({
    where: { id: { not: excludeEventId }, OR: [{ coverImage: url }, { floorPlanImageUrl: url }] },
  });
  if (stillReferenced === 0) await deletePublicBlobIfOwned(url);
}

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
  if (["DRAFT", "PUBLISHED", "CLOSED"].includes(body.status)) {
    // An event can be saved as a Draft with no Terms at all, but it can
    // never go live without one — enforced here, not just in the UI, so
    // this can't be bypassed by calling the API directly.
    if (body.status === "PUBLISHED") {
      const publishedTerms = await getPublishedAgreement("EVENT_TERMS", id);
      if (!publishedTerms) {
        return NextResponse.json(
          { error: "Add and publish this event's Terms & Conditions before publishing the event.", code: "TERMS_REQUIRED" },
          { status: 409 }
        );
      }
    }
    data.status = body.status;
  }
  if ("whatsappVendorGroupLink" in body) data.whatsappVendorGroupLink = body.whatsappVendorGroupLink || null;
  if ("acceptanceDeadlineHours" in body) {
    data.acceptanceDeadlineHours = body.acceptanceDeadlineHours ? Number(body.acceptanceDeadlineHours) : null;
  }

  const previous = data.coverImage !== undefined || data.floorPlanImageUrl !== undefined
    ? await prisma.event.findUnique({ where: { id }, select: { coverImage: true, floorPlanImageUrl: true } })
    : null;

  const event = await prisma.event.update({ where: { id }, data });

  if (previous) {
    if ("coverImage" in data && previous.coverImage && previous.coverImage !== data.coverImage) {
      await deleteEventImageIfUnshared(previous.coverImage, id);
    }
    if ("floorPlanImageUrl" in data && previous.floorPlanImageUrl && previous.floorPlanImageUrl !== data.floorPlanImageUrl) {
      await deleteEventImageIfUnshared(previous.floorPlanImageUrl, id);
    }
  }

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

  const event = await prisma.event.findUnique({ where: { id }, select: { coverImage: true, floorPlanImageUrl: true } });

  await prisma.event.delete({ where: { id } });

  if (event) {
    await deleteEventImageIfUnshared(event.coverImage, id);
    await deleteEventImageIfUnshared(event.floorPlanImageUrl, id);
  }

  return NextResponse.json({ ok: true });
}
