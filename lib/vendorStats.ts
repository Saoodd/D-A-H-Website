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
    paymentId: p.id,
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
// below 100%. Kept in sync with the non-optional fields in
// vendorRegisterSchema (lib/validation.ts): businessName, contactName,
// phone and category are the only ones a vendor can't sign up without.
// `website`, `instagram`, `logoUrl` and `description` are all genuinely
// optional at signup and on the profile form (never marked required, no
// server-side enforcement) — leaving any of them blank must never cost
// completion percentage, so none of them belong in this list.
const REQUIRED_FIELDS = ["businessName", "contactName", "phone", "category"] as const;

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
