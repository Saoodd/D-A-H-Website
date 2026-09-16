import "server-only";
import { prisma } from "../prisma";
import { sendWhatsAppTemplate } from "../whatsapp/infobip";
import { getMappedTemplate } from "../whatsapp/notificationRegistry";
import { whatsappEligibility } from "../whatsapp/consent";
import { normalizePhoneToE164 } from "../phone";
import type { EmailVariable, WhatsAppVariableMapping } from "../communications/variables";
import { USE_CASE_ENTITY_KIND, type NotificationUseCase } from "./useCases";

// The one centralized WhatsApp dispatch layer for DAH's automatic
// business-event notifications (as distinct from the Admin Communications
// Center's manual broadcasts, which go through lib/communications/service.ts
// instead — the two never share a code path, but DO share the same
// underlying primitives: sendWhatsAppTemplate, WhatsAppTemplateCache,
// dedupeKey idempotency, and the WhatsAppVariableMapping shape).
//
// Existing email notifications (lib/email/messages.ts) are DELIBERATELY
// left untouched and called directly at each trigger site, exactly as
// before — this module only ADDS a WhatsApp call alongside them. Email and
// WhatsApp are independent: a WhatsApp failure here never throws and never
// affects whether the caller's email send (or the business action that
// triggered both) succeeds.

export interface NotifyVendorWhatsAppInput {
  useCase: NotificationUseCase;
  vendorId: string;
  eventId?: string;
  applicationId?: string;
  paymentId?: string;
  /** Explicit dedupe/entity id override — only needed for a use case whose
   *  USE_CASE_ENTITY_KIND isn't "application" | "payment" | "event" (e.g.
   *  BOOKING_UPDATED, keyed on the booth). */
  entityId?: string;
  /** Real business data for this specific notification, keyed by the same
   *  safe variable vocabulary the Communications Center uses — the admin's
   *  placeholder/button mapping (Template Registry) resolves against
   *  exactly these keys. Only the keys relevant to this use case need be
   *  set; anything else resolves to "" if a mapping references it. */
  data: Partial<Record<EmailVariable, string>>;
}

export type NotifyVendorWhatsAppResult =
  | { ok: true; skipped?: boolean; reason?: string }
  | { ok: false; code: "OPT_OUT" | "INVALID_PHONE" | "NOT_CONFIGURED" | "NOT_APPROVED" | "DISABLED" | "INCOMPLETE_MAPPING" | "PROVIDER_FAILURE" | "VENDOR_NOT_FOUND"; error: string };

function resolvePlaceholders(mapping: WhatsAppVariableMapping, count: number, data: Partial<Record<EmailVariable, string>>): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const entry = mapping[String(i)];
    if (!entry) {
      out.push("");
    } else if (entry.kind === "literal") {
      out.push(entry.value);
    } else {
      out.push(data[entry.field] ?? "");
    }
  }
  return out;
}

function resolveButtons(
  buttons: { type: string; hasPlaceholder: boolean }[],
  buttonMapping: WhatsAppVariableMapping,
  data: Partial<Record<EmailVariable, string>>
): { type: string; parameter: string }[] {
  const out: { type: string; parameter: string }[] = [];
  buttons.forEach((b, idx) => {
    if (!b.hasPlaceholder) return; // static button — nothing to populate, never sent as a "buttons" entry
    const entry = buttonMapping[String(idx)];
    const parameter = !entry ? "" : entry.kind === "literal" ? entry.value : (data[entry.field] ?? "");
    out.push({ type: b.type || "URL", parameter });
  });
  return out;
}

function entityIdFor(useCase: NotificationUseCase, input: NotifyVendorWhatsAppInput): string | null {
  // An explicit entityId always wins — this is how a use case that can
  // legitimately recur for the SAME application/payment/event (e.g.
  // APPLICATION_ACCEPTED on a re-acceptance after a rejection) asks for a
  // fresh dedupeKey instead of being silently suppressed as a duplicate of
  // its own prior send. Callers for those use cases pass e.g.
  // `entityId: \`${applicationId}:${acceptedAt.getTime()}\``.
  if (input.entityId) return input.entityId;
  const kind = USE_CASE_ENTITY_KIND[useCase];
  if (kind === "application") return input.applicationId ?? null;
  if (kind === "payment") return input.paymentId ?? null;
  if (kind === "event") return input.eventId ?? null;
  return null; // "booth" and any future kind — caller must supply entityId
}

/** Sends one automatic WhatsApp Utility notification for a business event
 *  that has ALREADY happened server-side (the caller's DB write must have
 *  already committed — see each trigger site). Never throws; a WhatsApp
 *  failure here can never roll back or block the business action that
 *  triggered it, same contract as sendEmail/sendWhatsAppTemplate. */
export async function notifyVendorWhatsApp(input: NotifyVendorWhatsAppInput): Promise<NotifyVendorWhatsAppResult> {
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) {
    console.error(`[notifications] notifyVendorWhatsApp: vendor ${input.vendorId} not found`);
    return { ok: false, code: "VENDOR_NOT_FOUND", error: "Vendor not found." };
  }

  const consent = whatsappEligibility(vendor);
  if (!consent.eligible) {
    // Not an error — this is the expected, common case for a vendor who
    // hasn't opted in. Never blocks/fails the caller.
    return { ok: true, skipped: true, reason: consent.reason ?? "Not WhatsApp-eligible" };
  }
  const normalizedPhone = normalizePhoneToE164(vendor.phone);
  if (!normalizedPhone) {
    return { ok: false, code: "INVALID_PHONE", error: "Vendor phone number doesn't normalize to E.164." };
  }

  const lookup = await getMappedTemplate(input.useCase);
  if (!lookup.ok) return { ok: false, code: lookup.code, error: lookup.error };

  const placeholders = resolvePlaceholders(lookup.template.placeholderMapping, lookup.template.variableCount, input.data);
  const buttons = resolveButtons(lookup.template.buttons, lookup.template.buttonMapping, input.data);

  const entityId = entityIdFor(input.useCase, input);
  const dedupeKey = entityId ? `${input.useCase.toLowerCase()}:${entityId}` : undefined;
  if (!dedupeKey) {
    // A use case with no resolvable entity id would send unboundedly on
    // every retry — refuse rather than silently skip idempotency.
    console.error(`[notifications] notifyVendorWhatsApp: no entity id available for dedupeKey on "${input.useCase}" (vendor ${input.vendorId})`);
    return { ok: false, code: "NOT_CONFIGURED", error: "Missing entity id for this notification — this is a bug, not a config issue." };
  }

  const result = await sendWhatsAppTemplate({
    toE164: normalizedPhone,
    templateName: lookup.template.templateName,
    language: lookup.template.templateLanguage,
    placeholders,
    buttons: buttons.length > 0 ? buttons : undefined,
    type: "AUTOMATIC_NOTIFICATION",
    useCase: input.useCase,
    triggerType: "AUTOMATIC",
    vendorId: input.vendorId,
    eventId: input.eventId,
    applicationId: input.applicationId,
    paymentId: input.paymentId,
    dedupeKey,
  });

  if (!result.ok) return { ok: false, code: "PROVIDER_FAILURE", error: result.error };
  if (result.skipped) return { ok: true, skipped: true, reason: "Already sent for this event (duplicate suppressed)" };
  return { ok: true };
}
