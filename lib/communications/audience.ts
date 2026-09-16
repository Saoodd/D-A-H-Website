import "server-only";
import { prisma } from "../prisma";
import { getDisplayStatus } from "../status";
import { DisplayStatus } from "../constants";
import { whatsappEligibility } from "../whatsapp/consent";

// Resolves an Admin Communications audience filter into a concrete list of
// vendors to message — the ONE place this logic lives. Reuses
// getDisplayStatus() (lib/status.ts), the same function every other
// status-filtered admin list/export in the app already calls, rather than
// inventing a parallel "confirmed vendors" classifier. Called both for the
// live "N recipients" preview while Admin is still adjusting filters, and
// again, authoritatively, on the server at the moment of Send — the
// frontend's recipient list is NEVER trusted as-is (see
// lib/communications/service.ts).

export interface AudienceFilters {
  eventId: string | null; // null = All Events
  displayStatuses: DisplayStatus[]; // empty = any status
  boothTierKeys: string[]; // Booth.size values (PricingTier.sizeKey), empty = any
  boothCodes: string[]; // explicit codes, e.g. ["B1", "B3", "B7"]
  boothRangeFrom: string | null; // e.g. "B1"
  boothRangeTo: string | null; // e.g. "B20"
  vendorCategories: string[]; // Vendor.category values, empty = any
  businessNameQuery: string | null;
  phoneVerifiedOnly: boolean;
  whatsappOptedInOnly: boolean;
  applicationDateFrom: string | null; // ISO date
  applicationDateTo: string | null;
  paymentDateFrom: string | null;
  paymentDateTo: string | null;
  manualVendorIds: string[] | null; // when set, overrides all the above — explicit "Manual Selection" mode
  // Per-send fine-tuning on top of whichever mode produced the base list —
  // the Recipient Preview's "remove individual recipients" / "manually add
  // eligible vendors" actions (spec: item 8). Applied last, after every
  // other filter, so they work identically whether the base audience came
  // from filters or from Manual Selection.
  excludeVendorIds: string[];
  includeVendorIds: string[];
}

export const EMPTY_AUDIENCE_FILTERS: AudienceFilters = {
  eventId: null,
  displayStatuses: [],
  boothTierKeys: [],
  boothCodes: [],
  boothRangeFrom: null,
  boothRangeTo: null,
  vendorCategories: [],
  businessNameQuery: null,
  phoneVerifiedOnly: false,
  whatsappOptedInOnly: false,
  applicationDateFrom: null,
  applicationDateTo: null,
  paymentDateFrom: null,
  paymentDateTo: null,
  manualVendorIds: null,
  excludeVendorIds: [],
  includeVendorIds: [],
};

export interface AudienceRecipient {
  vendorId: string;
  applicationId: string | null;
  eventId: string | null;
  eventName: string | null;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  boothCodes: string[];
  displayStatus: DisplayStatus | null;
  amountPaidAedFils: number | null;
  amountDueAedFils: number | null;
  acceptanceExpiresAt: Date | null;
  emailEligible: boolean;
  emailIneligibleReason: string | null;
  whatsappEligible: boolean;
  whatsappIneligibleReason: string | null;
}

export interface AudienceResult {
  recipients: AudienceRecipient[];
  totalCount: number;
  emailEligibleCount: number;
  whatsappEligibleCount: number;
}

/** Parses a booth code into its alphabetic prefix + numeric suffix, e.g.
 *  "B14" -> {prefix:"B", num:14}. Returns null for codes that don't follow
 *  this convention (free-text codes like "VIP-Corner") — those simply
 *  never match a numeric range filter, which is the correct, safe
 *  behavior rather than a guess. */
function parseBoothCode(code: string): { prefix: string; num: number } | null {
  const m = code.trim().match(/^([A-Za-z]*)0*(\d+)$/);
  if (!m) return null;
  return { prefix: m[1].toUpperCase(), num: parseInt(m[2], 10) };
}

function codeInRange(code: string, fromCode: string, toCode: string): boolean {
  const c = parseBoothCode(code);
  const from = parseBoothCode(fromCode);
  const to = parseBoothCode(toCode);
  if (!c || !from || !to) return false;
  if (c.prefix !== from.prefix || c.prefix !== to.prefix) return false;
  const lo = Math.min(from.num, to.num);
  const hi = Math.max(from.num, to.num);
  return c.num >= lo && c.num <= hi;
}

function emailEligibility(email: string | null | undefined): { eligible: boolean; reason: string | null } {
  if (!email || !email.trim()) return { eligible: false, reason: "No email on file" };
  return { eligible: true, reason: null };
}

interface VendorRow {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  category: string;
  accountStatus: string;
  permanentlyDeletedAt: Date | null;
  phoneVerifiedAt: Date | null;
  whatsappOptInAt: Date | null;
  whatsappOptOutAt: Date | null;
}

function toRecipient(
  vendor: VendorRow,
  ctx: {
    applicationId: string | null;
    eventId: string | null;
    eventName: string | null;
    boothCodes: string[];
    displayStatus: DisplayStatus | null;
    amountPaidAedFils: number | null;
    amountDueAedFils: number | null;
    acceptanceExpiresAt: Date | null;
  }
): AudienceRecipient {
  const emailElig = emailEligibility(vendor.email);
  const waElig = whatsappEligibility(vendor);
  return {
    vendorId: vendor.id,
    applicationId: ctx.applicationId,
    eventId: ctx.eventId,
    eventName: ctx.eventName,
    businessName: vendor.businessName,
    contactName: vendor.contactName,
    email: vendor.email,
    phone: vendor.phone,
    boothCodes: ctx.boothCodes,
    displayStatus: ctx.displayStatus,
    amountPaidAedFils: ctx.amountPaidAedFils,
    amountDueAedFils: ctx.amountDueAedFils,
    acceptanceExpiresAt: ctx.acceptanceExpiresAt,
    emailEligible: emailElig.eligible,
    emailIneligibleReason: emailElig.reason,
    whatsappEligible: waElig.eligible,
    whatsappIneligibleReason: waElig.reason,
  };
}

function summarize(recipients: AudienceRecipient[]): AudienceResult {
  return {
    recipients,
    totalCount: recipients.length,
    emailEligibleCount: recipients.filter((r) => r.emailEligible).length,
    whatsappEligibleCount: recipients.filter((r) => r.whatsappEligible).length,
  };
}

/** The authoritative audience resolver. Always queries fresh from the
 *  database — never trusts a cached count or a frontend-supplied list.
 *  Manual Selection mode (filters.manualVendorIds set) still enforces
 *  active-account status; every other filter is ignored in that mode by
 *  design (an explicit hand-picked list is exactly what Admin asked for).
 *  excludeVendorIds/includeVendorIds are applied last, on top of whichever
 *  base list this produces. */
export async function resolveAudience(filters: AudienceFilters): Promise<AudienceResult> {
  const base = await resolveBaseAudience(filters);

  let recipients = base.recipients;
  if (filters.excludeVendorIds.length > 0) {
    const excluded = new Set(filters.excludeVendorIds);
    recipients = recipients.filter((r) => !excluded.has(r.vendorId));
  }
  if (filters.includeVendorIds.length > 0) {
    const already = new Set(recipients.map((r) => r.vendorId));
    const missingIds = filters.includeVendorIds.filter((id) => !already.has(id));
    if (missingIds.length > 0) {
      const extraVendors = await prisma.vendor.findMany({ where: { id: { in: missingIds }, accountStatus: "ACTIVE", permanentlyDeletedAt: null } });
      for (const vendor of extraVendors) {
        recipients.push(
          toRecipient(vendor, {
            applicationId: null,
            eventId: filters.eventId,
            eventName: null,
            boothCodes: [],
            displayStatus: null,
            amountPaidAedFils: null,
            amountDueAedFils: null,
            acceptanceExpiresAt: null,
          })
        );
      }
    }
  }

  return summarize(recipients);
}

async function resolveBaseAudience(filters: AudienceFilters): Promise<AudienceResult> {
  if (filters.manualVendorIds && filters.manualVendorIds.length > 0) {
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: filters.manualVendorIds }, accountStatus: "ACTIVE", permanentlyDeletedAt: null },
    });
    // For manual mode, best-effort resolve each vendor's most relevant
    // application within the selected event (if any) for booth/status
    // context — falls back to no application context otherwise.
    const applications = filters.eventId
      ? await prisma.application.findMany({
          where: { vendorId: { in: vendors.map((v) => v.id) }, eventId: filters.eventId },
          include: { payments: { where: { status: "SUCCEEDED" }, select: { paidAt: true, amountAedFils: true }, take: 1 }, assignedBooths: true, event: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const appByVendor = new Map<string, (typeof applications)[number]>();
    for (const a of applications) if (!appByVendor.has(a.vendorId)) appByVendor.set(a.vendorId, a);

    const recipients = vendors.map((vendor) => {
      const app = appByVendor.get(vendor.id);
      if (!app) {
        return toRecipient(vendor, {
          applicationId: null,
          eventId: filters.eventId,
          eventName: null,
          boothCodes: [],
          displayStatus: null,
          amountPaidAedFils: null,
          amountDueAedFils: null,
          acceptanceExpiresAt: null,
        });
      }
      const soldBooths = app.assignedBooths.filter((b) => b.status === "SOLD");
      const displayStatus = getDisplayStatus(app, app.payments.length > 0);
      return toRecipient(vendor, {
        applicationId: app.id,
        eventId: app.eventId,
        eventName: app.event.name,
        boothCodes: soldBooths.map((b) => b.code),
        displayStatus,
        amountPaidAedFils: app.payments[0]?.amountAedFils ?? null,
        amountDueAedFils: null,
        acceptanceExpiresAt: app.acceptanceExpiresAt,
      });
    });
    return summarize(recipients);
  }

  const applications = await prisma.application.findMany({
    where: {
      eventId: filters.eventId ?? undefined,
      createdAt: {
        gte: filters.applicationDateFrom ? new Date(filters.applicationDateFrom) : undefined,
        lte: filters.applicationDateTo ? new Date(filters.applicationDateTo) : undefined,
      },
      vendor: {
        accountStatus: "ACTIVE",
        permanentlyDeletedAt: null,
        category: filters.vendorCategories.length ? { in: filters.vendorCategories } : undefined,
        businessName: filters.businessNameQuery ? { contains: filters.businessNameQuery, mode: "insensitive" } : undefined,
        phoneVerifiedAt: filters.phoneVerifiedOnly ? { not: null } : undefined,
        whatsappOptInAt: filters.whatsappOptedInOnly ? { not: null } : undefined,
      },
    },
    include: {
      vendor: true,
      event: { select: { id: true, name: true } },
      payments: { where: { status: "SUCCEEDED" }, select: { paidAt: true, amountAedFils: true }, take: 1 },
      assignedBooths: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const filtered = applications.filter((app) => {
    const displayStatus = getDisplayStatus(app, app.payments.length > 0);
    if (filters.displayStatuses.length && !filters.displayStatuses.includes(displayStatus)) return false;

    const soldBooths = app.assignedBooths.filter((b) => b.status === "SOLD");

    if (filters.boothTierKeys.length) {
      const hasTier = soldBooths.some((b) => filters.boothTierKeys.includes(b.size));
      if (!hasTier) return false;
    }
    if (filters.boothCodes.length) {
      const codesUpper = filters.boothCodes.map((c) => c.trim().toUpperCase());
      const hasCode = soldBooths.some((b) => codesUpper.includes(b.code.toUpperCase()));
      if (!hasCode) return false;
    }
    if (filters.boothRangeFrom && filters.boothRangeTo) {
      const inRange = soldBooths.some((b) => codeInRange(b.code, filters.boothRangeFrom!, filters.boothRangeTo!));
      if (!inRange) return false;
    }
    if (filters.paymentDateFrom || filters.paymentDateTo) {
      const paidAt = app.payments[0]?.paidAt;
      if (!paidAt) return false;
      if (filters.paymentDateFrom && paidAt < new Date(filters.paymentDateFrom)) return false;
      if (filters.paymentDateTo && paidAt > new Date(filters.paymentDateTo)) return false;
    }
    return true;
  });

  // Dedupe by vendor — a vendor is messaged once even if "All Events" (or
  // any filter) matches more than one of their applications; the most
  // recent qualifying application (already the query's sort order)
  // supplies the per-recipient booth/status/event context.
  const seen = new Set<string>();
  const recipients: AudienceRecipient[] = [];
  for (const app of filtered) {
    if (seen.has(app.vendorId)) continue;
    seen.add(app.vendorId);
    const soldBooths = app.assignedBooths.filter((b) => b.status === "SOLD");
    const displayStatus = getDisplayStatus(app, app.payments.length > 0);
    const paid = app.payments[0]?.amountAedFils ?? null;
    recipients.push(
      toRecipient(app.vendor, {
        applicationId: app.id,
        eventId: app.eventId,
        eventName: app.event.name,
        boothCodes: soldBooths.map((b) => b.code),
        displayStatus,
        amountPaidAedFils: paid,
        amountDueAedFils: displayStatus === "ACCEPTED_UNPAID" ? soldBooths.reduce((sum, b) => sum + (b.priceAedFils ?? 0), 0) || null : null,
        acceptanceExpiresAt: app.acceptanceExpiresAt,
      })
    );
  }

  return summarize(recipients);
}

/** Builds the human-readable one-line audience summary shown throughout
 *  the Compose flow and saved onto Communication.audienceSummary, e.g.
 *  "DAH Vol 5 • Confirmed & Paid • Tier A". */
export function summarizeFilters(filters: AudienceFilters, eventName: string | null): string {
  if (filters.manualVendorIds && filters.manualVendorIds.length > 0) {
    return `Manual selection (${filters.manualVendorIds.length} vendors)`;
  }
  const parts: string[] = [filters.eventId ? eventName || "Selected event" : "All Events"];
  const statusLabels: Record<DisplayStatus, string> = {
    PENDING: "Pending",
    REJECTED: "Rejected",
    ACCEPTED_UNPAID: "Accepted — Unpaid",
    PAID: "Confirmed & Paid",
    EXPIRED: "Acceptance Expired",
  };
  if (filters.displayStatuses.length) parts.push(filters.displayStatuses.map((s) => statusLabels[s]).join("/"));
  if (filters.boothTierKeys.length) parts.push(`Tier ${filters.boothTierKeys.join("/")}`);
  if (filters.boothCodes.length) parts.push(`Booths ${filters.boothCodes.join(", ")}`);
  if (filters.boothRangeFrom && filters.boothRangeTo) parts.push(`Booths ${filters.boothRangeFrom}–${filters.boothRangeTo}`);
  if (filters.vendorCategories.length) parts.push(filters.vendorCategories.join("/"));
  if (filters.businessNameQuery) parts.push(`"${filters.businessNameQuery}"`);
  if (filters.phoneVerifiedOnly) parts.push("Phone verified");
  if (filters.whatsappOptedInOnly) parts.push("WhatsApp opted-in");
  return parts.join(" • ");
}
