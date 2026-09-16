import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { AudienceFilters, EMPTY_AUDIENCE_FILTERS } from "@/lib/communications/audience";
import { createCommunication } from "@/lib/communications/service";

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

// History list (Communications -> History) — excludes test sends, which
// are never part of the real campaign record.
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const communications = await prisma.communication.findMany({
    where: { isTest: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      internalName: true,
      sentByName: true,
      channel: true,
      eventNames: true,
      audienceSummary: true,
      status: true,
      totalRecipients: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
    take: 200,
  });

  return NextResponse.json({ ok: true, communications });
}

// Creates a new DRAFT communication — Compose's "Save Draft" / the implicit
// first step before Send. Never sends anything itself.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const internalName = String(body.internalName || "").trim();
  if (!internalName) return NextResponse.json({ error: "Give this communication an internal name." }, { status: 400 });

  const channel = body.channel;
  if (!["EMAIL", "WHATSAPP", "BOTH"].includes(channel)) {
    return NextResponse.json({ error: "Invalid channel." }, { status: 400 });
  }

  const filters = normalizeFilters(body.filters);
  let eventName: string | null = null;
  if (filters.eventId) {
    const event = await prisma.event.findUnique({ where: { id: filters.eventId }, select: { name: true } });
    eventName = event?.name ?? null;
  }

  const communication = await createCommunication({
    internalName,
    sentByName: typeof body.sentByName === "string" ? body.sentByName.trim().slice(0, 100) : null,
    channel,
    filters,
    eventName,
    emailSubject: typeof body.emailSubject === "string" ? body.emailSubject : null,
    emailBodyHtml: typeof body.emailBodyHtml === "string" ? body.emailBodyHtml : null,
    whatsappTemplateName: typeof body.whatsappTemplateName === "string" ? body.whatsappTemplateName : null,
    whatsappTemplateLanguage: typeof body.whatsappTemplateLanguage === "string" ? body.whatsappTemplateLanguage : null,
    whatsappVariablesJson: typeof body.whatsappVariablesJson === "string" ? body.whatsappVariablesJson : null,
  });

  return NextResponse.json({ ok: true, communication });
}
