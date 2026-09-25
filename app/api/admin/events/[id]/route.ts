import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getPublishedAgreement } from "@/lib/agreements";
import { deletePublicBlobIfOwned } from "@/lib/blob";
import { parseVenueBoundary, serializeVenueBoundary } from "@/lib/floorplan/boundary";

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
  // Physical Scale step of the Floor Plan Setup Wizard — the authoritative
  // real-world venue size, in millimetres. venueScaleConfirmed is set
  // TRUE only by an explicit admin action (never implied just by both mm
  // fields being non-null), so an admin can enter provisional numbers while
  // still iterating without the floor plan silently switching render modes
  // underneath them; going back to false is always allowed (e.g. before
  // recalibrating), matching the wizard's "Venue Scale Needs Configuration"
  // fallback for anything not explicitly confirmed.
  if ("venueWidthMm" in body) data.venueWidthMm = body.venueWidthMm ? Math.round(Number(body.venueWidthMm)) : null;
  if ("venueDepthMm" in body) data.venueDepthMm = body.venueDepthMm ? Math.round(Number(body.venueDepthMm)) : null;
  if ("venueScaleConfirmed" in body) data.venueScaleConfirmed = Boolean(body.venueScaleConfirmed);
  // Venue Boundary step of the Floor Plan Setup Wizard — venueShape and
  // venueBoundaryJson are written together (never independently) so a
  // half-updated shape/params pair can never land in the DB. Validated
  // through the same parse/serialize round-trip lib/floorplan/boundary.ts
  // uses everywhere else, so malformed params never get stored as if valid.
  if ("venueShape" in body || "venueBoundaryJson" in body) {
    const shape = typeof body.venueShape === "string" ? body.venueShape : "RECTANGLE";
    if (!["RECTANGLE", "CIRCLE", "OVAL", "POLYGON"].includes(shape)) {
      return NextResponse.json({ error: "Invalid venueShape." }, { status: 400 });
    }
    const boundary = parseVenueBoundary(shape, typeof body.venueBoundaryJson === "string" ? body.venueBoundaryJson : null);
    data.venueShape = boundary.shape;
    data.venueBoundaryJson = serializeVenueBoundary(boundary);
  }
  // Background Alignment step — the image's natural pixel size plus the
  // admin's chosen offset/scale/rotation/lock, all read together by
  // lib/floorplan/transform.ts computeBackgroundRect(). Naturally falls
  // back to null (auto "contain" fit) until an admin explicitly aligns it.
  if ("venueBackgroundNaturalWidthPx" in body) {
    data.venueBackgroundNaturalWidthPx = body.venueBackgroundNaturalWidthPx ? Math.round(Number(body.venueBackgroundNaturalWidthPx)) : null;
  }
  if ("venueBackgroundNaturalHeightPx" in body) {
    data.venueBackgroundNaturalHeightPx = body.venueBackgroundNaturalHeightPx ? Math.round(Number(body.venueBackgroundNaturalHeightPx)) : null;
  }
  if ("venueBackgroundOffsetXMm" in body) {
    data.venueBackgroundOffsetXMm = body.venueBackgroundOffsetXMm != null ? Number(body.venueBackgroundOffsetXMm) : null;
  }
  if ("venueBackgroundOffsetYMm" in body) {
    data.venueBackgroundOffsetYMm = body.venueBackgroundOffsetYMm != null ? Number(body.venueBackgroundOffsetYMm) : null;
  }
  if ("venueBackgroundScale" in body) {
    data.venueBackgroundScale = body.venueBackgroundScale ? Number(body.venueBackgroundScale) : null;
  }
  if ("venueBackgroundRotationDeg" in body) data.venueBackgroundRotationDeg = Number(body.venueBackgroundRotationDeg) || 0;
  if ("venueBackgroundLocked" in body) data.venueBackgroundLocked = Boolean(body.venueBackgroundLocked);
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
      // Mandatory Physical Scale gate: a floor plan whose real-world size
      // was never confirmed can't go live either — publishing on
      // unconfirmed/guessed geometry is exactly what this whole model
      // exists to prevent. Checks the value ABOUT TO BE SAVED (this same
      // request may be confirming scale and publishing in one call), not
      // just what's already in the DB.
      const willBeConfirmed = "venueScaleConfirmed" in data ? Boolean(data.venueScaleConfirmed) : undefined;
      if (willBeConfirmed === undefined || willBeConfirmed === false) {
        const current = await prisma.event.findUnique({ where: { id }, select: { venueScaleConfirmed: true } });
        if (!(willBeConfirmed ?? current?.venueScaleConfirmed)) {
          return NextResponse.json(
            { error: "Confirm this event's venue physical scale (Floor Plan → Physical Scale) before publishing.", code: "SCALE_REQUIRED" },
            { status: 409 }
          );
        }
      }
    }
    data.status = body.status;
  }
  if ("whatsappVendorGroupLink" in body) data.whatsappVendorGroupLink = body.whatsappVendorGroupLink || null;
  if ("acceptanceDeadlineHours" in body) {
    data.acceptanceDeadlineHours = body.acceptanceDeadlineHours ? Number(body.acceptanceDeadlineHours) : null;
  }
  if ("allowMultipleBooths" in body) {
    // Nullable override: null falls back to Settings.allowMultipleBoothsDefault
    // (see getAllowMultipleBooths) — true/false pins this event either way
    // regardless of the global default.
    data.allowMultipleBooths = body.allowMultipleBooths === null ? null : Boolean(body.allowMultipleBooths);
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

  // Signed Event Terms are legal records. The database already refuses to
  // cascade them away (AgreementAcceptance.agreementId has no onDelete), so
  // without this check the admin would just see an unexplained error.
  const signedTerms = await prisma.agreementAcceptance.count({ where: { agreement: { eventId: id } } });
  if (signedTerms > 0) {
    return NextResponse.json(
      { error: "Vendors have signed this event's terms, and those records must be kept, so it can't be deleted. Set it to Closed instead." },
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
