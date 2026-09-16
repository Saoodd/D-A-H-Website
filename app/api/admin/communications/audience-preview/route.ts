import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { AudienceFilters, EMPTY_AUDIENCE_FILTERS, resolveAudience, summarizeFilters } from "@/lib/communications/audience";

const RECIPIENT_PREVIEW_CAP = 1000;

function normalizeFilters(raw: unknown): AudienceFilters {
  const f = (raw && typeof raw === "object" ? raw : {}) as Partial<AudienceFilters>;
  return {
    ...EMPTY_AUDIENCE_FILTERS,
    ...f,
    displayStatuses: Array.isArray(f.displayStatuses) ? f.displayStatuses : [],
    boothTierKeys: Array.isArray(f.boothTierKeys) ? f.boothTierKeys : [],
    boothCodes: Array.isArray(f.boothCodes) ? f.boothCodes : [],
    vendorCategories: Array.isArray(f.vendorCategories) ? f.vendorCategories : [],
    manualVendorIds: Array.isArray(f.manualVendorIds) && f.manualVendorIds.length > 0 ? f.manualVendorIds : null,
    excludeVendorIds: Array.isArray(f.excludeVendorIds) ? f.excludeVendorIds : [],
    includeVendorIds: Array.isArray(f.includeVendorIds) ? f.includeVendorIds : [],
  };
}

// Live audience count + eligibility breakdown + (capped) recipient list for
// the Compose "N recipients" callout and the "View Recipients" table. Read
// only — never touched by Send itself, which recomputes this same
// resolveAudience() authoritatively server-side rather than trusting
// whatever this endpoint last returned to the browser.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const filters = normalizeFilters(body.filters);

  let eventName: string | null = null;
  if (filters.eventId) {
    const { prisma } = await import("@/lib/prisma");
    const event = await prisma.event.findUnique({ where: { id: filters.eventId }, select: { name: true } });
    eventName = event?.name ?? null;
  }

  const audience = await resolveAudience(filters);

  return NextResponse.json({
    ok: true,
    totalCount: audience.totalCount,
    emailEligibleCount: audience.emailEligibleCount,
    whatsappEligibleCount: audience.whatsappEligibleCount,
    summary: summarizeFilters(filters, eventName),
    recipients: audience.recipients.slice(0, RECIPIENT_PREVIEW_CAP),
    truncated: audience.recipients.length > RECIPIENT_PREVIEW_CAP,
  });
}
