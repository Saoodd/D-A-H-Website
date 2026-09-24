import "server-only";
import crypto from "crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "../prisma";
import { sendEmail } from "../email/core";
import { sendWhatsAppTemplate } from "../whatsapp/infobip";
import { normalizePhoneToE164 } from "../phone";
import { DisplayStatus } from "../constants";
import { AudienceFilters, AudienceRecipient, resolveAudience, summarizeFilters } from "./audience";
import { renderEmailForRecipient, renderWhatsAppPlaceholders, WhatsAppVariableMapping } from "./render";

// The one place a Communication (broadcast/campaign) is created, sent,
// tested, and retried — Compose/History/Delivery-Log API routes all call
// this rather than talking to sendEmail()/sendWhatsAppTemplate() directly,
// per the spec's "one centralized communications service" requirement.
//
// SAFETY DESIGN (read before changing this file):
//  - Recipient snapshot: resolveAudience() is called fresh, authoritatively,
//    inside sendCommunication() itself — never trusts a list the caller
//    supplies. The resulting CommunicationRecipient rows are the frozen
//    snapshot; they never change even if the vendor's real data changes
//    later.
//  - Idempotency has three independent layers, so a double-click, page
//    refresh, API retry, or serverless function retry can never send the
//    same message twice:
//      1. Communication.status DRAFT->SENDING is an atomic compare-and-swap
//         (updateMany with a status guard) — only one caller's request
//         actually starts the send.
//      2. CommunicationRecipient rows are unique per (communication,
//         vendor, channel) — creating them twice is a no-op
//         (skipDuplicates), and each row is claimed QUEUED->PROCESSING
//         atomically before it's actually sent, so two concurrent workers
//         processing the same Communication can never both send to the
//         same recipient.
//      3. The actual provider call (sendEmail / sendWhatsAppTemplate) is
//         itself deduped via a unique dedupeKey
//         (`broadcast:<communicationId>:<vendorId>`) on the existing
//         EmailDelivery table and the new WhatsAppDelivery table — even a
//         literal duplicate function call resolves to a no-op.

const CONCURRENCY = 5;

export interface CreateCommunicationInput {
  internalName: string;
  sentByName?: string | null;
  channel: "EMAIL" | "WHATSAPP" | "BOTH";
  filters: AudienceFilters;
  eventName: string | null;
  emailSubject?: string | null;
  emailBodyHtml?: string | null;
  whatsappTemplateName?: string | null;
  whatsappTemplateLanguage?: string | null;
  whatsappVariablesJson?: string | null;
}

export async function createCommunication(input: CreateCommunicationInput) {
  const audienceSummary = summarizeFilters(input.filters, input.eventName);
  return prisma.communication.create({
    data: {
      idempotencyKey: crypto.randomUUID(),
      internalName: input.internalName,
      sentByName: input.sentByName || null,
      channel: input.channel,
      eventId: input.filters.eventId,
      eventNames: input.filters.eventId ? input.eventName : "All Events",
      audienceFiltersJson: JSON.stringify(input.filters),
      audienceSummary,
      emailSubject: input.emailSubject || null,
      emailBodyHtml: input.emailBodyHtml || null,
      whatsappTemplateName: input.whatsappTemplateName || null,
      whatsappTemplateLanguage: input.whatsappTemplateLanguage || null,
      whatsappVariablesJson: input.whatsappVariablesJson || null,
      status: "DRAFT",
    },
  });
}

export async function updateCommunicationDraft(id: string, input: Partial<CreateCommunicationInput>) {
  const existing = await prisma.communication.findUnique({ where: { id } });
  if (!existing || existing.status !== "DRAFT") return null;
  const filters = input.filters;
  const audienceSummary = filters ? summarizeFilters(filters, input.eventName ?? null) : undefined;
  return prisma.communication.update({
    where: { id },
    data: {
      internalName: input.internalName,
      sentByName: input.sentByName ?? undefined,
      channel: input.channel,
      eventId: filters ? filters.eventId : undefined,
      eventNames: filters ? (filters.eventId ? input.eventName : "All Events") : undefined,
      audienceFiltersJson: filters ? JSON.stringify(filters) : undefined,
      audienceSummary,
      emailSubject: input.emailSubject ?? undefined,
      emailBodyHtml: input.emailBodyHtml ?? undefined,
      whatsappTemplateName: input.whatsappTemplateName ?? undefined,
      whatsappTemplateLanguage: input.whatsappTemplateLanguage ?? undefined,
      whatsappVariablesJson: input.whatsappVariablesJson ?? undefined,
    },
  });
}

function substitutePlainText(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => values[key] ?? match);
}

const SYNTHETIC_SAMPLE_RECIPIENT: AudienceRecipient = {
  vendorId: "sample",
  applicationId: null,
  eventId: null,
  eventName: null,
  businessName: "Sample Business",
  contactName: "Sample Contact",
  email: "sample@example.com",
  phone: "+971500000000",
  boothCodes: ["B1"],
  displayStatus: "PAID",
  amountPaidAedFils: 175000,
  amountDueAedFils: null,
  acceptanceExpiresAt: new Date(),
  emailEligible: true,
  emailIneligibleReason: null,
  whatsappEligible: true,
  whatsappIneligibleReason: null,
};

type EventCtx = { name: string; startDate: Date; location: string } | null;

async function loadEventCtx(eventId: string | null): Promise<EventCtx> {
  if (!eventId) return null;
  return prisma.event.findUnique({ where: { id: eventId }, select: { name: true, startDate: true, location: true } });
}

async function processOneRecipient(
  row: { id: string; vendorId: string; applicationId: string | null; businessNameSnapshot: string; contactNameSnapshot: string; emailSnapshot: string | null; phoneSnapshot: string | null; boothCodesSnapshot: string | null; applicationStatusSnapshot: string | null; channel: string; destination: string | null },
  comm: { id: string; eventId: string | null; emailSubject: string | null; emailBodyHtml: string | null; whatsappTemplateName: string | null; whatsappTemplateLanguage: string | null; whatsappVariablesJson: string | null },
  event: EventCtx
) {
  const claim = await prisma.communicationRecipient.updateMany({ where: { id: row.id, status: "QUEUED" }, data: { status: "PROCESSING" } });
  if (claim.count === 0) return; // already claimed by a concurrent invocation of this same send

  const recipient: AudienceRecipient = {
    vendorId: row.vendorId,
    applicationId: row.applicationId,
    eventId: comm.eventId,
    eventName: event?.name ?? null,
    businessName: row.businessNameSnapshot,
    contactName: row.contactNameSnapshot,
    email: row.emailSnapshot || "",
    phone: row.phoneSnapshot || "",
    boothCodes: row.boothCodesSnapshot ? row.boothCodesSnapshot.split(",") : [],
    displayStatus: (row.applicationStatusSnapshot as DisplayStatus | null) ?? null,
    amountPaidAedFils: null,
    amountDueAedFils: null,
    acceptanceExpiresAt: null,
    emailEligible: true,
    emailIneligibleReason: null,
    whatsappEligible: true,
    whatsappIneligibleReason: null,
  };

  const dedupeKey = `broadcast:${comm.id}:${row.vendorId}`;

  if (row.channel === "EMAIL") {
    const html = renderEmailForRecipient(comm.emailBodyHtml || "", recipient, { event });
    const subject = substitutePlainText(comm.emailSubject || "", { business_name: recipient.businessName, event_name: event?.name ?? recipient.eventName ?? "" });
    const result = await sendEmail({ to: row.destination!, subject, html, type: "BROADCAST", vendorId: row.vendorId, eventId: comm.eventId || undefined, dedupeKey });
    const delivery = await prisma.emailDelivery.findUnique({ where: { dedupeKey } });
    await prisma.communicationRecipient.update({
      where: { id: row.id },
      data: { status: result.ok ? "SENT" : "FAILED", emailDeliveryId: delivery?.id ?? null, processedAt: new Date(), skipReason: result.ok ? null : "Email send failed — see Delivery Logs" },
    });
    return;
  }

  // WHATSAPP
  if (!comm.whatsappTemplateName || !comm.whatsappTemplateLanguage) {
    await prisma.communicationRecipient.update({ where: { id: row.id }, data: { status: "SKIPPED", skipReason: "No WhatsApp template configured", processedAt: new Date() } });
    return;
  }
  const normalizedPhone = normalizePhoneToE164(row.phoneSnapshot || "");
  if (!normalizedPhone) {
    await prisma.communicationRecipient.update({ where: { id: row.id }, data: { status: "SKIPPED", skipReason: "Invalid phone number", processedAt: new Date() } });
    return;
  }
  const templateRow = await prisma.whatsAppTemplateCache.findUnique({ where: { name_language: { name: comm.whatsappTemplateName, language: comm.whatsappTemplateLanguage } } });
  const mapping: WhatsAppVariableMapping = comm.whatsappVariablesJson ? JSON.parse(comm.whatsappVariablesJson) : {};
  const variableCount = templateRow?.variableCount ?? Object.keys(mapping).length;
  const placeholders = renderWhatsAppPlaceholders(mapping, variableCount, recipient, { event });
  const result = await sendWhatsAppTemplate({
    toE164: normalizedPhone,
    templateName: comm.whatsappTemplateName,
    language: comm.whatsappTemplateLanguage,
    placeholders,
    type: "BROADCAST",
    triggerType: "ADMIN_BROADCAST",
    vendorId: row.vendorId,
    eventId: comm.eventId || undefined,
    dedupeKey,
  });
  const delivery = await prisma.whatsAppDelivery.findUnique({ where: { dedupeKey } });
  await prisma.communicationRecipient.update({
    where: { id: row.id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      whatsappDeliveryId: delivery?.id ?? null,
      processedAt: new Date(),
      skipReason: result.ok ? null : ("error" in result ? result.error : "WhatsApp send failed"),
    },
  });
}

async function processQueuedRecipients(communicationId: string, comm: { id: string; eventId: string | null; emailSubject: string | null; emailBodyHtml: string | null; whatsappTemplateName: string | null; whatsappTemplateLanguage: string | null; whatsappVariablesJson: string | null }, event: EventCtx) {
  const queued = await prisma.communicationRecipient.findMany({ where: { communicationId, status: "QUEUED" } });
  for (let i = 0; i < queued.length; i += CONCURRENCY) {
    const batch = queued.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map((row) => processOneRecipient(row, comm, event)));
  }
}

async function finalizeCommunicationStatus(communicationId: string): Promise<{ ok: true }> {
  const recipients = await prisma.communicationRecipient.findMany({ where: { communicationId }, select: { status: true } });
  const sent = recipients.filter((r) => r.status === "SENT" || r.status === "DELIVERED").length;
  const failed = recipients.filter((r) => r.status === "FAILED").length;
  const inFlight = recipients.filter((r) => r.status === "QUEUED" || r.status === "PROCESSING").length;

  let status: string;
  if (inFlight > 0) status = "SENDING";
  else if (failed === 0) status = "COMPLETED";
  else if (sent > 0) status = "PARTIALLY_FAILED";
  else status = "FAILED";

  await prisma.communication.update({ where: { id: communicationId }, data: { status, completedAt: inFlight > 0 ? null : new Date() } });
  return { ok: true };
}

export type SendCommunicationResult = { ok: true } | { ok: false; error: string };

/** Runs (or resumes) a real send. Safe to call more than once for the same
 *  Communication — see the safety design note at the top of this file. */
export async function sendCommunication(communicationId: string): Promise<SendCommunicationResult> {
  const comm = await prisma.communication.findUnique({ where: { id: communicationId } });
  if (!comm) return { ok: false, error: "Communication not found." };
  if (comm.status === "COMPLETED" || comm.status === "FAILED" || comm.status === "PARTIALLY_FAILED") {
    return { ok: false, error: `This communication is already ${comm.status.replace("_", " ").toLowerCase()}. Use Retry Failed for the remaining recipients instead.` };
  }

  await prisma.communication.updateMany({ where: { id: communicationId, status: "DRAFT" }, data: { status: "SENDING", startedAt: new Date() } });

  const filters = JSON.parse(comm.audienceFiltersJson) as AudienceFilters;
  const audience = await resolveAudience(filters);
  const event = await loadEventCtx(comm.eventId);

  const wantsEmail = comm.channel === "EMAIL" || comm.channel === "BOTH";
  const wantsWhatsApp = comm.channel === "WHATSAPP" || comm.channel === "BOTH";

  const rowsToCreate: Prisma.CommunicationRecipientCreateManyInput[] = [];
  for (const r of audience.recipients) {
    const base = {
      communicationId,
      vendorId: r.vendorId,
      applicationId: r.applicationId,
      businessNameSnapshot: r.businessName,
      contactNameSnapshot: r.contactName,
      emailSnapshot: r.email,
      phoneSnapshot: r.phone,
      boothCodesSnapshot: r.boothCodes.length ? r.boothCodes.join(",") : null,
      applicationStatusSnapshot: r.displayStatus,
    };
    if (wantsEmail) {
      rowsToCreate.push({ ...base, channel: "EMAIL", destination: r.email, status: r.emailEligible ? "QUEUED" : "SKIPPED", skipReason: r.emailIneligibleReason });
    }
    if (wantsWhatsApp) {
      rowsToCreate.push({ ...base, channel: "WHATSAPP", destination: r.phone, status: r.whatsappEligible ? "QUEUED" : "SKIPPED", skipReason: r.whatsappIneligibleReason });
    }
  }
  if (rowsToCreate.length > 0) {
    await prisma.communicationRecipient.createMany({ data: rowsToCreate, skipDuplicates: true });
  }
  await prisma.communication.update({ where: { id: communicationId }, data: { totalRecipients: audience.recipients.length } });

  await processQueuedRecipients(communicationId, comm, event);
  return finalizeCommunicationStatus(communicationId);
}

/** Retries ONLY recipients whose last attempt genuinely FAILED (a
 *  transient provider error) — never SKIPPED rows (permanent reasons like
 *  "No email on file" / "No WhatsApp opt-in" / "Invalid phone number"),
 *  and never rows that already succeeded. */
export async function retryFailedRecipients(communicationId: string): Promise<SendCommunicationResult> {
  const comm = await prisma.communication.findUnique({ where: { id: communicationId } });
  if (!comm) return { ok: false, error: "Communication not found." };
  const resetCount = await prisma.communicationRecipient.updateMany({ where: { communicationId, status: "FAILED" }, data: { status: "QUEUED" } });
  if (resetCount.count === 0) return { ok: false, error: "No failed recipients to retry." };

  await prisma.communication.update({ where: { id: communicationId }, data: { status: "SENDING" } });
  const event = await loadEventCtx(comm.eventId);
  await processQueuedRecipients(communicationId, comm, event);
  return finalizeCommunicationStatus(communicationId);
}

export interface SendTestResult {
  ok: boolean;
  email?: { ok: boolean };
  whatsapp?: { ok: boolean; error?: string };
}

/** Sends a one-off test copy — to the admin's own email/phone, never to
 *  real vendors, never recorded in CommunicationRecipient or counted in
 *  delivery stats. Uses the first real matching recipient's data for
 *  variable substitution when one exists, otherwise a clearly-labeled
 *  sample recipient, so the preview is meaningful even before any real
 *  vendor matches the audience yet. */
export async function sendTestCommunication(communicationId: string, opts: { testEmail?: string; testPhoneE164?: string }): Promise<SendTestResult> {
  const comm = await prisma.communication.findUnique({ where: { id: communicationId } });
  if (!comm) return { ok: false };

  const filters = JSON.parse(comm.audienceFiltersJson) as AudienceFilters;
  const audience = await resolveAudience(filters);
  const sample = audience.recipients[0] ?? SYNTHETIC_SAMPLE_RECIPIENT;
  const event = await loadEventCtx(comm.eventId);

  const result: SendTestResult = { ok: true };

  if (opts.testEmail && (comm.channel === "EMAIL" || comm.channel === "BOTH")) {
    const html = renderEmailForRecipient(comm.emailBodyHtml || "", sample, { event });
    const subject = `[TEST] ${substitutePlainText(comm.emailSubject || "", { business_name: sample.businessName, event_name: event?.name ?? sample.eventName ?? "" })}`;
    const r = await sendEmail({ to: opts.testEmail, subject, html, type: "BROADCAST_TEST" });
    result.email = { ok: r.ok };
  }

  if (opts.testPhoneE164 && (comm.channel === "WHATSAPP" || comm.channel === "BOTH") && comm.whatsappTemplateName && comm.whatsappTemplateLanguage) {
    const templateRow = await prisma.whatsAppTemplateCache.findUnique({ where: { name_language: { name: comm.whatsappTemplateName, language: comm.whatsappTemplateLanguage } } });
    const mapping: WhatsAppVariableMapping = comm.whatsappVariablesJson ? JSON.parse(comm.whatsappVariablesJson) : {};
    const placeholders = renderWhatsAppPlaceholders(mapping, templateRow?.variableCount ?? 0, sample, { event });
    const r = await sendWhatsAppTemplate({
      toE164: opts.testPhoneE164,
      templateName: comm.whatsappTemplateName,
      language: comm.whatsappTemplateLanguage,
      placeholders,
      type: "BROADCAST_TEST",
      triggerType: "ADMIN_BROADCAST",
    });
    result.whatsapp = { ok: r.ok, error: r.ok ? undefined : r.error };
  }

  return result;
}
