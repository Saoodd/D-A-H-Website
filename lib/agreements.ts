import "server-only";
import { prisma } from "./prisma";
import type { LegalDocType } from "./legalDocs";

// VENDOR_TERMS / EVENT_TERMS are accepted by vendors. The LegalDocType
// values (public Privacy / Terms / Refund pages, see lib/legalDocs.ts) only
// borrow the draft/publish/version machinery; they are never accepted.
export type AgreementType = "VENDOR_TERMS" | "EVENT_TERMS" | LegalDocType;

const DEFAULT_VENDOR_TERMS_HTML = `
<p>These Terms &amp; Conditions govern any vendor's application for, and booking of, a booth at a Dar Al Hay (DAH) event. By creating a DAH business account, the vendor agrees to be bound by these terms.</p>
<p><strong>1. Application &amp; acceptance.</strong> Creating an account does not guarantee a booth at any event. DAH reviews and verifies every business, and reviews every event application, at its sole discretion. An accepted vendor must complete the acceptance steps (including any event-specific Terms &amp; Conditions) within the deadline shown on their dashboard to confirm a booth.</p>
<p><strong>2. Booth selection.</strong> Booths are selected on a first-confirmed basis via the vendor dashboard. A booth selection is held temporarily while the vendor completes checkout and is not confirmed until payment succeeds.</p>
<p><strong>3. Vendor obligations.</strong> Vendors should hold a valid trade license where applicable to their business, arrive and depart within the published event hours, keep their booth in good order, and comply with venue and municipality rules.</p>
<p><strong>4. Fees.</strong> Booth fees are as displayed at checkout and are VAT-inclusive unless stated otherwise. DAH may add a manual adjustment to a booking with a stated reason.</p>
<p><strong>5. Cancellations.</strong> Bookings are non-refundable once paid, except where DAH specifically approves an exception. See our Refund &amp; Cancellation Policy.</p>
<p><strong>6. Liability.</strong> DAH is not liable for loss, damage or injury arising from a vendor's participation, except where required by law.</p>
<p><strong>7. Event-specific terms.</strong> Individual DAH events may carry their own additional Terms &amp; Conditions, presented and accepted separately before payment for that event.</p>
`.trim();

/** Guarantees a PUBLISHED VENDOR_TERMS agreement always exists, so
 *  signup enforcement (§7) never has a gap where nothing has been
 *  written yet. Idempotent — safe to call on every signup-page load. */
export async function ensureVendorTermsExist(): Promise<void> {
  const existing = await prisma.agreement.findFirst({ where: { type: "VENDOR_TERMS", eventId: null } });
  if (existing) return;
  await prisma.agreement.create({
    data: {
      type: "VENDOR_TERMS",
      eventId: null,
      version: 1,
      title: "Dar Al Hay Vendor Terms & Conditions",
      bodyHtml: DEFAULT_VENDOR_TERMS_HTML,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
}

export async function getPublishedAgreement(type: AgreementType, eventId: string | null = null) {
  return prisma.agreement.findFirst({
    where: { type, eventId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
}

export async function getDraftAgreement(type: AgreementType, eventId: string | null = null) {
  return prisma.agreement.findFirst({
    where: { type, eventId, status: "DRAFT" },
    orderBy: { version: "desc" },
  });
}

/** How many distinct vendors (VENDOR_TERMS) or applications (EVENT_TERMS)
 *  have accepted this agreement version — the same "one signer, one count"
 *  definition the Terms Status table already uses (it dedupes acceptances
 *  by applicationId into a Set). A vendor can end up with more than one
 *  AgreementAcceptance row for the same version (e.g. a retried request),
 *  and those must never be double-counted here — every acceptance-count
 *  surface in Admin is expected to agree, so they all need the same
 *  distinct-signer definition, not a raw row count. */
async function countDistinctAcceptances(agreementId: string, type: AgreementType): Promise<number> {
  const distinctField = type === "EVENT_TERMS" ? "applicationId" : "vendorId";
  const rows = await prisma.agreementAcceptance.findMany({
    where: { agreementId },
    distinct: [distinctField],
    select: { [distinctField]: true },
  });
  return rows.length;
}

export async function getAcceptanceCount(agreementId: string, type: AgreementType): Promise<number> {
  return countDistinctAcceptances(agreementId, type);
}

export async function getVersionHistory(type: AgreementType, eventId: string | null = null) {
  const versions = await prisma.agreement.findMany({
    where: { type, eventId },
    orderBy: { version: "desc" },
  });
  return Promise.all(
    versions.map(async (v) => ({
      ...v,
      acceptanceCount: await countDistinctAcceptances(v.id, type),
    }))
  );
}

/** Returns the in-progress draft for this scope, creating one (starting
 *  from the currently published text, or blank) if none exists yet.
 *  There is at most one DRAFT per (type, eventId) at a time. */
export async function getOrCreateDraft(type: AgreementType, eventId: string | null, defaultTitle: string, defaultBodyHtml = "") {
  const existingDraft = await getDraftAgreement(type, eventId);
  if (existingDraft) return existingDraft;

  const [published, latest] = await Promise.all([
    getPublishedAgreement(type, eventId),
    prisma.agreement.findFirst({ where: { type, eventId }, orderBy: { version: "desc" } }),
  ]);
  const nextVersion = (latest?.version ?? 0) + 1;

  return prisma.agreement.create({
    data: {
      type,
      eventId,
      version: nextVersion,
      title: published?.title ?? defaultTitle,
      bodyHtml: published?.bodyHtml ?? defaultBodyHtml,
      status: "DRAFT",
    },
  });
}

/** Only a DRAFT can be freely edited — once PUBLISHED, a version's text
 *  is permanent (every past acceptance is pinned to it). */
export async function saveDraft(agreementId: string, data: { title: string; bodyHtml: string }) {
  const agreement = await prisma.agreement.findUnique({ where: { id: agreementId } });
  if (!agreement || agreement.status !== "DRAFT") {
    throw new Error("Only a draft can be edited.");
  }
  return prisma.agreement.update({ where: { id: agreementId }, data: { title: data.title, bodyHtml: data.bodyHtml } });
}

/** Deletes an in-progress DRAFT only — never the currently PUBLISHED
 *  version, never an ARCHIVED (past) version, and never any
 *  AgreementAcceptance signed against a different version. A draft has by
 *  definition never been published, so no vendor has ever signed it. */
export async function discardDraft(agreementId: string) {
  const agreement = await prisma.agreement.findUnique({ where: { id: agreementId } });
  if (!agreement || agreement.status !== "DRAFT") {
    throw new Error("Only a draft can be discarded.");
  }
  await prisma.agreement.delete({ where: { id: agreementId } });
}

export async function publishDraft(agreementId: string) {
  const agreement = await prisma.agreement.findUnique({ where: { id: agreementId } });
  if (!agreement || agreement.status !== "DRAFT") {
    throw new Error("Only a draft can be published.");
  }
  return prisma.$transaction(async (tx) => {
    await tx.agreement.updateMany({
      where: { type: agreement.type, eventId: agreement.eventId, status: "PUBLISHED" },
      data: { status: "ARCHIVED" },
    });
    return tx.agreement.update({
      where: { id: agreementId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
  });
}

export interface AcceptanceBoothSnapshot {
  code: string;
  widthMm: number | null;
  depthMm: number | null;
  priceAedFils: number | null;
}

export async function recordAcceptance(params: {
  agreementId: string;
  vendorId: string;
  applicationId?: string | null;
  representativeName?: string | null;
  businessName: string;
  contactName: string;
  eventName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  // EVENT_TERMS only — the booth(s) this acceptance is being made against,
  // captured immutably at the moment of acceptance. See schema comment on
  // AgreementAcceptance.snapshotBoothsJson.
  booths?: AcceptanceBoothSnapshot[] | null;
}) {
  const agreement = await prisma.agreement.findUnique({ where: { id: params.agreementId } });
  if (!agreement || agreement.status !== "PUBLISHED") {
    throw new Error("This agreement is not currently published.");
  }
  const acceptance = await prisma.agreementAcceptance.create({
    data: {
      agreementId: agreement.id,
      vendorId: params.vendorId,
      applicationId: params.applicationId ?? null,
      representativeName: params.representativeName ?? null,
      snapshotType: agreement.type,
      snapshotTitle: agreement.title,
      snapshotVersion: agreement.version,
      snapshotBodyHtml: agreement.bodyHtml,
      snapshotBusinessName: params.businessName,
      snapshotContactName: params.contactName,
      snapshotEventName: params.eventName ?? null,
      snapshotBoothsJson: params.booths && params.booths.length > 0 ? JSON.stringify(params.booths) : null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });

  syncAcceptanceToSheet(acceptance, agreement);

  return acceptance;
}

/** Optional, best-effort mirror of a new acceptance to an external
 *  spreadsheet (e.g. a Google Sheets Apps Script webhook). The database
 *  row created above is always the source of truth — this never blocks,
 *  retries, or throws; if AGREEMENTS_SHEETS_WEBHOOK_URL isn't set, or the
 *  request fails, the acceptance is simply not mirrored. */
function syncAcceptanceToSheet(
  acceptance: { id: string; representativeName: string | null; snapshotBusinessName: string; snapshotEventName: string | null; snapshotTitle: string; snapshotVersion: number; acceptedAt: Date; applicationId: string | null },
  agreement: { type: string }
): void {
  const url = process.env.AGREEMENTS_SHEETS_WEBHOOK_URL;
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business: acceptance.snapshotBusinessName,
      event: acceptance.snapshotEventName ?? "",
      agreement: acceptance.snapshotTitle,
      agreementType: agreement.type,
      version: acceptance.snapshotVersion,
      signedBy: acceptance.representativeName ?? "",
      acceptedAt: acceptance.acceptedAt.toISOString(),
      applicationId: acceptance.applicationId ?? "",
    }),
  }).catch(() => {
    // Best-effort only — the database row is already the source of truth.
  });
}

/** Has this vendor accepted the CURRENTLY published Vendor Terms? If none
 *  is published (shouldn't happen once ensureVendorTermsExist has run,
 *  but defensively) this does not block — there is nothing to accept. */
export async function hasAcceptedCurrentVendorTerms(vendorId: string): Promise<boolean> {
  const published = await getPublishedAgreement("VENDOR_TERMS", null);
  if (!published) return true;
  const acceptance = await prisma.agreementAcceptance.findFirst({
    where: { vendorId, agreementId: published.id },
  });
  return !!acceptance;
}

/** Has this vendor accepted the CURRENTLY published Event Terms for this
 *  specific application? Deliberately not auto-applied: an event with no
 *  published Event Terms yet has nothing to accept, so this doesn't block
 *  — DAH must explicitly write terms per event (never one shared global
 *  template, per the platform's own requirement). */
export async function hasAcceptedCurrentEventTerms(vendorId: string, applicationId: string, eventId: string): Promise<boolean> {
  const published = await getPublishedAgreement("EVENT_TERMS", eventId);
  if (!published) return true;
  const acceptance = await prisma.agreementAcceptance.findFirst({
    where: { vendorId, applicationId, agreementId: published.id },
  });
  return !!acceptance;
}

/** For the booking flow: is there even an Event Terms agreement to show?
 *  Used to decide whether the "Review & Accept Event Terms" step appears
 *  at all for this event. */
export async function eventHasPublishedTerms(eventId: string): Promise<boolean> {
  const published = await getPublishedAgreement("EVENT_TERMS", eventId);
  return !!published;
}

export interface EventTermsOverview {
  eventId: string;
  eventName: string;
  eventSlug: string;
  startDate: Date;
  location: string;
  eventStatus: string;
  publishedVersion: number | null;
  publishedTitle: string | null;
  publishedAt: Date | null;
  hasDraft: boolean;
  relevantCount: number;
  signedCount: number;
}

/** One row per event, for the Event Terms hub (Admin ▸ Agreements ▸ Event
 *  Terms). "Relevant" vendors are applications that reached ACCEPTED —
 *  the same status the event workspace's own Terms Status table already
 *  uses — and "signed" is how many of those specific applications have an
 *  acceptance tied to that event's CURRENTLY published version, using the
 *  exact same distinct-signer-per-application logic as the rest of the
 *  agreements system so every count surface agrees. */
export async function getEventTermsOverview(): Promise<EventTermsOverview[]> {
  const events = await prisma.event.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, slug: true, startDate: true, location: true, status: true },
  });
  if (events.length === 0) return [];

  const eventIds = events.map((e) => e.id);

  const [publishedAgreements, draftAgreements, relevantApplications] = await Promise.all([
    prisma.agreement.findMany({ where: { type: "EVENT_TERMS", eventId: { in: eventIds }, status: "PUBLISHED" } }),
    prisma.agreement.findMany({ where: { type: "EVENT_TERMS", eventId: { in: eventIds }, status: "DRAFT" }, select: { eventId: true } }),
    prisma.application.findMany({ where: { eventId: { in: eventIds }, status: "ACCEPTED" }, select: { id: true, eventId: true } }),
  ]);

  const publishedByEvent = new Map(publishedAgreements.map((a) => [a.eventId as string, a]));
  const draftEventIds = new Set(draftAgreements.map((d) => d.eventId as string));
  const relevantByEvent = new Map<string, string[]>();
  for (const app of relevantApplications) {
    const list = relevantByEvent.get(app.eventId) ?? [];
    list.push(app.id);
    relevantByEvent.set(app.eventId, list);
  }

  const publishedAgreementIds = publishedAgreements.map((a) => a.id);
  const signedAccs = publishedAgreementIds.length
    ? await prisma.agreementAcceptance.findMany({
        where: { agreementId: { in: publishedAgreementIds }, applicationId: { not: null } },
        distinct: ["applicationId"],
        select: { agreementId: true, applicationId: true },
      })
    : [];
  const signedByAgreement = new Map<string, Set<string>>();
  for (const acc of signedAccs) {
    if (!acc.applicationId) continue;
    const set = signedByAgreement.get(acc.agreementId) ?? new Set<string>();
    set.add(acc.applicationId);
    signedByAgreement.set(acc.agreementId, set);
  }

  return events.map((e) => {
    const published = publishedByEvent.get(e.id) ?? null;
    const relevantIds = relevantByEvent.get(e.id) ?? [];
    const signedSet = published ? signedByAgreement.get(published.id) ?? new Set<string>() : new Set<string>();
    const signedCount = relevantIds.filter((id) => signedSet.has(id)).length;
    return {
      eventId: e.id,
      eventName: e.name,
      eventSlug: e.slug,
      startDate: e.startDate,
      location: e.location,
      eventStatus: e.status,
      publishedVersion: published?.version ?? null,
      publishedTitle: published?.title ?? null,
      publishedAt: published?.publishedAt ?? null,
      hasDraft: draftEventIds.has(e.id),
      relevantCount: relevantIds.length,
      signedCount,
    };
  });
}

export interface EventVendorAgreementRow {
  applicationId: string;
  businessName: string;
  contactName: string;
  username: string;
  vendorId: string;
  boothCode: string | null;
  displayStatus: string;
  agreementAccepted: boolean;
  acceptedVersion: number | null;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  acceptanceRecordId: string | null;
}

/** Every ACCEPTED application for one event, with that application's
 *  status against the event's CURRENTLY published Event Terms version —
 *  the "Vendor Agreement Status" table in the per-event Agreements
 *  workspace. Reuses the same relevant-vendor and distinct-signer
 *  definitions as getEventTermsOverview so the two pages never disagree. */
export async function getEventVendorAgreementStatus(eventId: string): Promise<EventVendorAgreementRow[]> {
  const [applications, published] = await Promise.all([
    prisma.application.findMany({
      where: { eventId, status: "ACCEPTED" },
      include: {
        vendor: { select: { id: true, username: true } },
        payments: { where: { status: "SUCCEEDED" } },
      },
      orderBy: { businessName: "asc" },
    }),
    getPublishedAgreement("EVENT_TERMS", eventId),
  ]);

  const applicationIds = applications.map((a) => a.id);
  const [soldBooths, acceptances] = await Promise.all([
    applicationIds.length
      ? prisma.booth.findMany({ where: { assignedApplicationId: { in: applicationIds }, status: "SOLD" }, select: { code: true, assignedApplicationId: true } })
      : Promise.resolve([]),
    published && applicationIds.length
      ? prisma.agreementAcceptance.findMany({ where: { agreementId: published.id, applicationId: { in: applicationIds } } })
      : Promise.resolve([]),
  ]);
  // A last-write-wins Map here would silently drop one booth's code for any
  // application with 2 sold booths — group instead so every sold booth is
  // represented (see formatBoothCodes for the shared "B3 + B4" join).
  const boothCodesByApp = new Map<string, string[]>();
  for (const b of soldBooths) {
    if (!b.assignedApplicationId) continue;
    const list = boothCodesByApp.get(b.assignedApplicationId) ?? [];
    list.push(b.code);
    boothCodesByApp.set(b.assignedApplicationId, list);
  }
  const acceptanceByApp = new Map(acceptances.filter((a) => a.applicationId).map((a) => [a.applicationId as string, a]));

  const { getDisplayStatus } = await import("./status");

  return applications.map((a) => {
    const acceptance = acceptanceByApp.get(a.id) ?? null;
    return {
      applicationId: a.id,
      businessName: a.businessName,
      contactName: a.contactName,
      username: a.vendor.username,
      vendorId: a.vendor.id,
      boothCode: (boothCodesByApp.get(a.id) ?? []).join(" + ") || null,
      displayStatus: getDisplayStatus(a, a.payments.length > 0),
      agreementAccepted: !!acceptance,
      acceptedVersion: acceptance?.snapshotVersion ?? null,
      acceptedBy: acceptance?.representativeName ?? null,
      acceptedAt: acceptance?.acceptedAt ?? null,
      acceptanceRecordId: acceptance?.id ?? null,
    };
  });
}
