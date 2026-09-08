import "server-only";
import { prisma } from "./prisma";

/** A vendor's DAH participation, derived entirely from their successful
 *  payments — never a stored counter (see AGENTS/brief: don't fake counts).
 *  One event can only count once even if it somehow has multiple successful
 *  payments; the most recent is kept. */
export async function getVendorParticipation(vendorId: string) {
  const payments = await prisma.payment.findMany({
    where: { status: "SUCCEEDED", application: { vendorId } },
    include: {
      booth: true,
      application: { include: { event: true } },
    },
    orderBy: { paidAt: "desc" },
  });

  const byEvent = new Map<string, (typeof payments)[number]>();
  for (const p of payments) {
    if (!byEvent.has(p.eventId)) byEvent.set(p.eventId, p);
  }
  const all = Array.from(byEvent.values());

  const now = new Date();
  const past: typeof all = [];
  const upcoming: typeof all = [];
  for (const p of all) {
    const endsAt = p.application.event.endDate ?? p.application.event.startDate;
    (endsAt < now ? past : upcoming).push(p);
  }

  const toEntry = (p: (typeof all)[number]) => ({
    applicationId: p.applicationId,
    eventId: p.eventId,
    eventName: p.application.event.name,
    eventSlug: p.application.event.slug,
    startDate: p.application.event.startDate,
    endDate: p.application.event.endDate,
    location: p.application.event.location,
    boothCode: p.booth.code,
    boothSize: p.booth.size,
    amountAedFils: p.amountAedFils,
    paidAt: p.paidAt,
    whatsappVendorGroupLink: p.application.event.whatsappVendorGroupLink,
  });

  return {
    eventsParticipated: past.length,
    upcomingConfirmedCount: upcoming.length,
    history: past.map(toEntry),
    upcoming: upcoming.map(toEntry),
  };
}

// Always required — these are the only fields that can ever keep a vendor
// below 100%. `website` is deliberately excluded: it's a nice-to-have, never
// counted, so leaving it blank can never cost completion percentage.
const REQUIRED_FIELDS = ["businessName", "contactName", "phone", "category", "instagram", "logoUrl", "description"] as const;

/** Profile completion — recomputed live from only the fields that are
 *  CURRENTLY required, never a stored percentage (see brief §31/32).
 *  Trade licence is the one field whose requiredness itself is configurable
 *  (Admin → Settings → Trade Licence Required, the single source of truth
 *  also used at signup — see lib/agreements.ts / VendorsClient): it only
 *  joins the required set, and therefore only affects the percentage or
 *  appears as "missing", when that setting is on. With it off, an
 *  unfilled trade licence can never prevent 100%. */
export function computeProfileCompletion(vendor: Record<string, unknown>, options: { tradeLicenseRequired: boolean }) {
  const fields: string[] = [...REQUIRED_FIELDS];
  if (options.tradeLicenseRequired) fields.push("tradeLicenseFileUrl");

  const isFilled = (f: string) => {
    const v = vendor[f];
    return typeof v === "string" ? v.trim().length > 0 : v != null;
  };
  const missing = fields.filter((f) => !isFilled(f));
  return {
    percent: Math.round(((fields.length - missing.length) / fields.length) * 100),
    missing,
  };
}
