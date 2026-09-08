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

const PROFILE_FIELDS = ["businessName", "contactName", "phone", "category", "instagram", "logoUrl"] as const;
const RECOMMENDED_FIELDS = ["description", "website"] as const;

/** Profile completion, calculated from required + recommended fields —
 *  never a stored percentage (see brief §31/32). */
export function computeProfileCompletion(vendor: Record<string, unknown>) {
  const fields = [...PROFILE_FIELDS, ...RECOMMENDED_FIELDS];
  const filled = fields.filter((f) => {
    const v = vendor[f];
    return typeof v === "string" ? v.trim().length > 0 : v != null;
  });
  const missing = fields.filter((f) => !filled.includes(f));
  return {
    percent: Math.round((filled.length / fields.length) * 100),
    missing,
  };
}
