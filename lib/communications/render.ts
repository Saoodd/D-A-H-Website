import "server-only";
import { formatAed, formatBoothCodes } from "../constants";
import { sanitizeEmailHtml } from "../sanitizeHtml";
import { emailShell } from "../email/template";
import type { AudienceRecipient } from "./audience";
import { EMAIL_VARIABLES, type EmailVariable } from "./variables";

export { EMAIL_VARIABLES, type EmailVariable };

// Predefined, safe personalization variables only — {{business_name}} etc.
// substituted by simple literal string replacement, never evaluated as an
// expression/template language. Unrecognized {{...}} tokens are left
// untouched (not silently deleted) so a typo is visible to the admin in
// the preview rather than disappearing.

interface RecipientVariableContext {
  event?: { name: string; startDate: Date; location: string } | null;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" });
}

/** Builds the {{variable}} -> real-value map for one recipient. Every
 *  value is already plain text (not HTML) — safe to drop directly into
 *  sanitized email HTML or a WhatsApp template placeholder alike. */
export function buildVariableContext(recipient: AudienceRecipient, ctx: RecipientVariableContext = {}): Record<EmailVariable, string> {
  const bookingUrl = recipient.applicationId
    ? `${siteUrl()}/vendor/applications/${recipient.applicationId}`
    : `${siteUrl()}/vendor/dashboard`;
  return {
    business_name: recipient.businessName || "—",
    contact_name: recipient.contactName || "—",
    event_name: ctx.event?.name || recipient.eventName || "—",
    event_date: formatDate(ctx.event?.startDate ?? null),
    venue: ctx.event?.location || "—",
    booth: recipient.boothCodes.length ? formatBoothCodes(recipient.boothCodes) : "—",
    amount_paid: recipient.amountPaidAedFils != null ? formatAed(recipient.amountPaidAedFils) : "—",
    amount_due: recipient.amountDueAedFils != null ? formatAed(recipient.amountDueAedFils) : "—",
    acceptance_deadline: formatDate(recipient.acceptanceExpiresAt),
    booking_url: bookingUrl,
  };
}

function substituteVariables(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const value = values[key as keyof typeof values];
    return value !== undefined ? value : match;
  });
}

/** Renders one recipient's final email HTML: sanitize the admin-authored
 *  body first (defense in depth — same rule as every other admin-authored
 *  HTML in this app, see lib/sanitizeHtml.ts), THEN substitute variables,
 *  THEN wrap in the shared DAH email shell — in that order, so a
 *  variable's resolved value (plain text, e.g. a business name) can never
 *  itself be interpreted as markup even if it contained HTML-like
 *  characters. */
export function renderEmailForRecipient(rawBodyHtml: string, recipient: AudienceRecipient, ctx: RecipientVariableContext = {}): string {
  const sanitized = sanitizeEmailHtml(rawBodyHtml);
  const values = buildVariableContext(recipient, ctx);
  const substituted = substituteVariables(sanitized, values);
  return emailShell(substituted);
}

/** Plain-text preview (variables substituted, but no HTML/shell) — used by
 *  the Compose UI's live preview pane before wrapping in the full shell. */
export function previewEmailBody(rawBodyHtml: string, recipient: AudienceRecipient, ctx: RecipientVariableContext = {}): string {
  const sanitized = sanitizeEmailHtml(rawBodyHtml);
  return substituteVariables(sanitized, buildVariableContext(recipient, ctx));
}

// ---------------------------------------------------------------------------
// WhatsApp template variable mapping — {{1}}, {{2}}, ... map to EITHER a
// dynamic recipient field (one of EMAIL_VARIABLES, reused as the same safe
// list) or a literal admin-entered string. Never arbitrary code.
// ---------------------------------------------------------------------------
export type WhatsAppVariableMapping = Record<string, { kind: "field"; field: EmailVariable } | { kind: "literal"; value: string }>;

/** Resolves a WhatsApp template's {{1}}..{{N}} mapping into the ordered
 *  placeholder array Infobip's template-message API expects (see
 *  lib/whatsapp/infobip.ts sendWhatsAppTemplate). */
export function renderWhatsAppPlaceholders(
  mapping: WhatsAppVariableMapping,
  variableCount: number,
  recipient: AudienceRecipient,
  ctx: RecipientVariableContext = {}
): string[] {
  const values = buildVariableContext(recipient, ctx);
  const placeholders: string[] = [];
  for (let i = 1; i <= variableCount; i++) {
    const entry = mapping[String(i)];
    if (!entry) {
      placeholders.push("");
    } else if (entry.kind === "literal") {
      placeholders.push(entry.value);
    } else {
      placeholders.push(values[entry.field] ?? "");
    }
  }
  return placeholders;
}

/** Renders a template body's {{1}} {{2}}.. tokens with resolved values, for
 *  the admin-facing preview only (Infobip itself renders the real message
 *  from templateName+placeholders — this is never what's actually sent). */
export function previewWhatsAppBody(bodyText: string, mapping: WhatsAppVariableMapping, variableCount: number, recipient: AudienceRecipient, ctx: RecipientVariableContext = {}): string {
  const placeholders = renderWhatsAppPlaceholders(mapping, variableCount, recipient, ctx);
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, idxStr: string) => {
    const idx = parseInt(idxStr, 10);
    return idx >= 1 && idx <= placeholders.length ? placeholders[idx - 1] || match : match;
  });
}
