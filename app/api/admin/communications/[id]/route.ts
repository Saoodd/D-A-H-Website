import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { AudienceFilters, EMPTY_AUDIENCE_FILTERS } from "@/lib/communications/audience";
import { updateCommunicationDraft } from "@/lib/communications/service";

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

// Full detail — Communication snapshot + its recipients, with optional
// channel/status filters (spec: "Delivery filters — All/Delivered/Sent/
// Failed/Skipped, and by Email/WhatsApp"). Recipient snapshot fields never
// change after the fact, per the audience-snapshot-at-send-time
// requirement; delivery status DOES keep updating live (from the Resend/
// Infobip webhooks) since that's genuinely current delivery state, not a
// frozen fact about who was targeted.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const communication = await prisma.communication.findUnique({ where: { id } });
  if (!communication) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel"); // EMAIL | WHATSAPP | null
  const status = searchParams.get("status"); // QUEUED|PROCESSING|SENT|DELIVERED|FAILED|SKIPPED | null

  const recipients = await prisma.communicationRecipient.findMany({
    where: {
      communicationId: id,
      channel: channel && ["EMAIL", "WHATSAPP"].includes(channel) ? channel : undefined,
      status: status ? status : undefined,
    },
    orderBy: { businessNameSnapshot: "asc" },
    take: 2000,
  });

  const allForStats = await prisma.communicationRecipient.findMany({ where: { communicationId: id }, select: { channel: true, status: true } });
  const stats = {
    email: { queued: 0, sent: 0, delivered: 0, failed: 0, skipped: 0 },
    whatsapp: { queued: 0, sent: 0, delivered: 0, failed: 0, skipped: 0 },
  };
  for (const r of allForStats) {
    const bucket = r.channel === "EMAIL" ? stats.email : r.channel === "WHATSAPP" ? stats.whatsapp : null;
    if (!bucket) continue;
    if (r.status === "QUEUED" || r.status === "PROCESSING") bucket.queued++;
    else if (r.status === "SENT") bucket.sent++;
    else if (r.status === "DELIVERED") bucket.delivered++;
    else if (r.status === "FAILED") bucket.failed++;
    else if (r.status === "SKIPPED") bucket.skipped++;
  }

  return NextResponse.json({ ok: true, communication, recipients, stats });
}

// Edits a DRAFT only — recalculates nothing itself (the Compose UI re-calls
// audience-preview live); Send is what freezes the snapshot.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const filters = body.filters ? normalizeFilters(body.filters) : undefined;
  let eventName: string | null = null;
  if (filters?.eventId) {
    const event = await prisma.event.findUnique({ where: { id: filters.eventId }, select: { name: true } });
    eventName = event?.name ?? null;
  }

  const updated = await updateCommunicationDraft(id, {
    internalName: typeof body.internalName === "string" ? body.internalName.trim() : undefined,
    sentByName: typeof body.sentByName === "string" ? body.sentByName.trim().slice(0, 100) : undefined,
    channel: body.channel,
    filters,
    eventName,
    emailSubject: typeof body.emailSubject === "string" ? body.emailSubject : undefined,
    emailBodyHtml: typeof body.emailBodyHtml === "string" ? body.emailBodyHtml : undefined,
    whatsappTemplateName: typeof body.whatsappTemplateName === "string" ? body.whatsappTemplateName : undefined,
    whatsappTemplateLanguage: typeof body.whatsappTemplateLanguage === "string" ? body.whatsappTemplateLanguage : undefined,
    whatsappVariablesJson: typeof body.whatsappVariablesJson === "string" ? body.whatsappVariablesJson : undefined,
  });
  if (!updated) return NextResponse.json({ error: "Only a Draft communication can be edited." }, { status: 400 });

  return NextResponse.json({ ok: true, communication: updated });
}

// Deletes a DRAFT only — never a sent/sending communication (history must
// be permanent).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const communication = await prisma.communication.findUnique({ where: { id } });
  if (!communication) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (communication.status !== "DRAFT") {
    return NextResponse.json({ error: "Only a Draft communication can be deleted." }, { status: 400 });
  }
  await prisma.communication.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
