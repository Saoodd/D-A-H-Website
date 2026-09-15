import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { slugify } from "@/lib/slug";

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const startDate = body.startDate ? new Date(body.startDate) : null;
  const location = String(body.location || "").trim();
  if (!name || !startDate || Number.isNaN(startDate.getTime()) || !location) {
    return NextResponse.json({ error: "Name, start date and location are required." }, { status: 400 });
  }

  let slug = slugify(body.slug || name);
  const existingSlug = await prisma.event.findUnique({ where: { slug } });
  if (existingSlug) slug = `${slug}-${Date.now().toString(36)}`;

  const duplicateFromEventId = body.duplicateFromEventId as string | undefined;
  const sourceEvent = duplicateFromEventId
    ? await prisma.event.findUnique({ where: { id: duplicateFromEventId } })
    : null;

  const event = await prisma.event.create({
    data: {
      slug,
      name,
      description: String(body.description || ""),
      startDate,
      endDate: body.endDate ? new Date(body.endDate) : null,
      location,
      coverImage: body.coverImage || null,
      categories: Array.isArray(body.categories) ? body.categories.map(String).filter(Boolean) : [],
      floorPlanImageUrl: body.floorPlanImageUrl || sourceEvent?.floorPlanImageUrl || null,
      venueWidthM: body.venueWidthM ? Number(body.venueWidthM) : sourceEvent?.venueWidthM ?? null,
      showPublicPricing: "showPublicPricing" in body ? Boolean(body.showPublicPricing) : true,
      status: ["DRAFT", "PUBLISHED", "CLOSED"].includes(body.status) ? body.status : "DRAFT",
      whatsappVendorGroupLink: body.whatsappVendorGroupLink || null,
      acceptanceDeadlineHours: body.acceptanceDeadlineHours ? Number(body.acceptanceDeadlineHours) : null,
      allowMultipleBooths: body.allowMultipleBooths === null || body.allowMultipleBooths === undefined ? null : Boolean(body.allowMultipleBooths),
    },
  });

  if (duplicateFromEventId) {
    const [sourceBooths, sourceFeatures] = await Promise.all([
      prisma.booth.findMany({ where: { eventId: duplicateFromEventId } }),
      prisma.floorPlanFeature.findMany({ where: { eventId: duplicateFromEventId } }),
    ]);

    if (sourceBooths.length > 0) {
      await prisma.booth.createMany({
        data: sourceBooths.map((b) => ({
          eventId: event.id,
          code: b.code,
          size: b.size,
          gridX: b.gridX,
          gridY: b.gridY,
          gridW: b.gridW,
          gridH: b.gridH,
          rotation: b.rotation,
          priceAedFils: b.priceAedFils,
          colorHex: b.colorHex,
          status: "AVAILABLE",
        })),
      });
    }
    if (sourceFeatures.length > 0) {
      await prisma.floorPlanFeature.createMany({
        data: sourceFeatures.map((f) => ({
          eventId: event.id,
          type: f.type,
          label: f.label,
          gridX: f.gridX,
          gridY: f.gridY,
          gridW: f.gridW,
          gridH: f.gridH,
          rotation: f.rotation,
        })),
      });
    }

    // Terms & Conditions are copied ONLY when the admin explicitly opts in
    // (see the "Copy Terms & Conditions from the original event?" checkbox)
    // — every new event otherwise starts with no Event Terms at all, never
    // silently inheriting the source event's, since Terms is a per-event,
    // legally-meaningful document. When it is copied, it becomes a
    // brand-new, independent v1 for this event — never a reference back to
    // the source, so editing one never touches the other.
    const sourceTerms = body.copyTerms
      ? await prisma.agreement.findFirst({
          where: { type: "EVENT_TERMS", eventId: duplicateFromEventId, status: "PUBLISHED" },
          orderBy: { version: "desc" },
        })
      : null;
    if (sourceTerms) {
      await prisma.agreement.create({
        data: {
          type: "EVENT_TERMS",
          eventId: event.id,
          version: 1,
          title: sourceTerms.title,
          bodyHtml: sourceTerms.bodyHtml,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
    }
  }

  return NextResponse.json({ ok: true, event });
}
