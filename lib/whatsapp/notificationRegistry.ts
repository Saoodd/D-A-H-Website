import "server-only";
import { prisma } from "../prisma";
import { listWhatsAppTemplates, serializeButtons, parseButtonsJson, type ParsedWhatsAppTemplateButton } from "./infobip";
import type { WhatsAppVariableMapping } from "../communications/variables";
import type { NotificationUseCase } from "../notifications/useCases";

// Resolves a DAH notification use case (e.g. "APPLICATION_ACCEPTED") to a
// REAL, admin-mapped, live-verified Infobip template — mirroring
// lib/whatsapp/otp.ts's getConfiguredAuthTemplate() exactly: never
// auto-picks a template, never assumes a mapping is still valid, and
// fails honestly (never sends) if the admin's mapping points at a
// template that's missing, unapproved, or itself an AUTHENTICATION
// template. The mapping itself (which real template fulfills which use
// case) is admin-configured in the DB via the Template Registry UI
// (Admin > Communications > Template Registry) — never an env var per
// template, and never guessed by this app.

const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour — same freshness window as OTP's template check

export interface MappedTemplate {
  templateName: string;
  templateLanguage: string;
  variableCount: number;
  placeholderMapping: WhatsAppVariableMapping;
  buttons: ParsedWhatsAppTemplateButton[];
  buttonMapping: WhatsAppVariableMapping; // keyed by the button's index (as a string) in `buttons`
}

export type MappedTemplateFailureCode = "NOT_CONFIGURED" | "NOT_APPROVED" | "DISABLED";
export type MappedTemplateResult = { ok: true; template: MappedTemplate } | { ok: false; code: MappedTemplateFailureCode; error: string };

function genericError(useCase: string): string {
  return `WhatsApp notifications for "${useCase}" aren't set up yet — map a real approved template in Admin → Communications → Template Registry.`;
}

/** Refreshes WhatsAppTemplateCache from Infobip's live template list —
 *  identical logic to lib/whatsapp/otp.ts's own refresh (deliberately
 *  duplicated rather than shared, since otp.ts must stay untouched per
 *  the "do not destabilize working OTP" requirement; this is the second,
 *  independent copy for Utility-template consumers). */
async function refreshTemplateCache(name: string, language: string) {
  let cached = await prisma.whatsAppTemplateCache.findUnique({ where: { name_language: { name, language } } });
  const isFresh = cached != null && Date.now() - cached.syncedAt.getTime() < CACHE_MAX_AGE_MS;
  if (isFresh) return cached;

  const result = await listWhatsAppTemplates();
  if (result.ok) {
    for (const t of result.templates) {
      await prisma.whatsAppTemplateCache.upsert({
        where: { name_language: { name: t.name, language: t.language } },
        update: {
          category: t.category,
          status: t.status,
          bodyText: t.bodyText,
          headerText: t.headerText,
          footerText: t.footerText,
          buttonsJson: serializeButtons(t.buttons),
          variableCount: t.variableCount,
          isAuthTemplate: t.isAuthTemplate,
          source: "SYNCED",
          syncedAt: new Date(),
        },
        create: {
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          bodyText: t.bodyText,
          headerText: t.headerText,
          footerText: t.footerText,
          buttonsJson: serializeButtons(t.buttons),
          variableCount: t.variableCount,
          isAuthTemplate: t.isAuthTemplate,
          source: "SYNCED",
        },
      });
    }
    cached = await prisma.whatsAppTemplateCache.findUnique({ where: { name_language: { name, language } } });
  }
  // If the live refresh itself failed, fall through with whatever's
  // cached (possibly stale, possibly null) rather than blocking every
  // notification on a transient Infobip outage — same tradeoff otp.ts
  // makes for phone verification.
  return cached;
}

export async function getMappedTemplate(useCase: NotificationUseCase): Promise<MappedTemplateResult> {
  const mapping = await prisma.whatsAppNotificationTemplate.findUnique({ where: { useCase } });
  if (!mapping) {
    console.error(`[whatsapp:notifications] no template mapped for use case "${useCase}"`);
    return { ok: false, code: "NOT_CONFIGURED", error: genericError(useCase) };
  }
  if (!mapping.enabled) {
    return { ok: false, code: "DISABLED", error: `WhatsApp notifications for "${useCase}" are currently disabled by an admin.` };
  }

  const { templateName: name, templateLanguage: language } = mapping;
  const cached = await refreshTemplateCache(name, language);

  if (!cached) {
    console.error(`[whatsapp:notifications] template "${name}" (${language}) mapped to "${useCase}" was not found on this Infobip account`);
    return { ok: false, code: "NOT_CONFIGURED", error: genericError(useCase) };
  }
  if (cached.isAuthTemplate) {
    // The Template Registry picker never offers an AUTHENTICATION template
    // for mapping, so this should be unreachable — fail closed anyway
    // rather than ever sending dahverify as a Utility notification.
    console.error(`[whatsapp:notifications] template "${name}" (${language}) mapped to "${useCase}" is an AUTHENTICATION template — refusing to send`);
    return { ok: false, code: "NOT_APPROVED", error: genericError(useCase) };
  }
  const status = (cached.status || "").toUpperCase();
  if (status && status !== "APPROVED") {
    console.error(`[whatsapp:notifications] template "${name}" (${language}) mapped to "${useCase}" status is "${cached.status}", not APPROVED`);
    return { ok: false, code: "NOT_APPROVED", error: genericError(useCase) };
  }

  return {
    ok: true,
    template: {
      templateName: name,
      templateLanguage: language,
      variableCount: cached.variableCount,
      placeholderMapping: mapping.placeholderMappingJson ? (JSON.parse(mapping.placeholderMappingJson) as WhatsAppVariableMapping) : {},
      buttons: parseButtonsJson(cached.buttonsJson),
      buttonMapping: mapping.buttonMappingJson ? (JSON.parse(mapping.buttonMappingJson) as WhatsAppVariableMapping) : {},
    },
  };
}
