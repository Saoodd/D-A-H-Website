import "server-only";
import { prisma } from "./prisma";

export type AgreementType = "VENDOR_TERMS" | "EVENT_TERMS";

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
export async function getOrCreateDraft(type: AgreementType, eventId: string | null, defaultTitle: string) {
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
      bodyHtml: published?.bodyHtml ?? "",
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
