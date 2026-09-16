import "server-only";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

// Infobip WhatsApp Business API — a SEPARATE Infobip product/channel from
// the 2FA PIN API used for phone OTP (lib/sms/infobip.ts). Reuses the same
// account credentials (INFOBIP_BASE_URL / INFOBIP_API_KEY) since both are
// the same Infobip account, but needs one additional env var:
// INFOBIP_WHATSAPP_SENDER — the WhatsApp Business number actually
// registered/approved on that account (MSISDN, no leading "+").
//
// IMPORTANT — this module was built against Infobip's publicly documented
// request/response shape for sending a template message (confirmed via
// Infobip's own docs at build time: POST {baseUrl}/whatsapp/1/message/template
// with a `messages[]` envelope, `content.templateName` /
// `content.templateData.body.placeholders` / `content.language`). The
// template-LIST endpoint's exact JSON field names could not be confirmed
// the same way (network access to infobip.com was blocked while this was
// built), so listWhatsAppTemplates() below parses the response
// defensively — it tries several plausible field-name variants rather
// than assuming one shape, and falls back to a clearly-flagged empty
// result (never a guessed/fabricated template list) if the response
// doesn't match anything recognized. Verify the live response shape
// against a real account before relying on this in production; the admin
// UI also supports manually registering a template as a fallback.

interface WhatsAppConfig {
  baseUrl: string;
  apiKey: string;
  sender: string;
}

function getConfig(): WhatsAppConfig | null {
  const baseUrl = process.env.INFOBIP_BASE_URL;
  const apiKey = process.env.INFOBIP_API_KEY;
  const sender = process.env.INFOBIP_WHATSAPP_SENDER;
  if (!baseUrl || !apiKey || !sender) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, sender: sender.replace(/^\+/, "") };
}

export function isWhatsAppConfigured(): boolean {
  return getConfig() !== null;
}

export const WHATSAPP_NOT_CONFIGURED_MESSAGE =
  "WhatsApp isn't configured yet — set INFOBIP_WHATSAPP_SENDER (and confirm INFOBIP_BASE_URL/INFOBIP_API_KEY have the WhatsApp channel enabled) to send real messages.";

function toInfobipMsisdn(phoneE164: string): string {
  return phoneE164.replace(/^\+/, "");
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `App ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
}

// ---------------------------------------------------------------------------
// Template listing — live-synced, never hardcoded.
// ---------------------------------------------------------------------------

export interface ParsedWhatsAppTemplate {
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  bodyText: string | null;
  variableCount: number;
  isAuthTemplate: boolean;
}

function countPlaceholders(text: string | null): number {
  if (!text) return 0;
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g);
  return matches ? new Set(matches).size : 0;
}

/** Best-effort extraction of a template's body text from one of several
 *  plausible Infobip response shapes. Returns null rather than throwing if
 *  none match — callers must treat a null body as "couldn't read this
 *  template's content", not as an empty template. */
function extractBodyText(item: Record<string, unknown>): string | null {
  const structure = item.structure as Record<string, unknown> | undefined;
  const structureBody = structure?.body as Record<string, unknown> | undefined;
  if (typeof structureBody?.text === "string") return structureBody.text;

  const components = item.components as unknown[] | undefined;
  if (Array.isArray(components)) {
    const bodyComponent = components.find(
      (c) => typeof c === "object" && c !== null && (c as Record<string, unknown>).type === "BODY"
    ) as Record<string, unknown> | undefined;
    if (typeof bodyComponent?.text === "string") return bodyComponent.text;
  }

  const body = item.body as Record<string, unknown> | string | undefined;
  if (typeof body === "string") return body;
  if (typeof body?.text === "string") return body.text;

  return null;
}

export type ListTemplatesResult =
  | { ok: true; templates: ParsedWhatsAppTemplate[] }
  | { ok: false; code: "CONFIG_MISSING" | "PROVIDER_FAILURE" | "UNRECOGNIZED_RESPONSE"; error: string };

/** Calls Infobip's live WhatsApp template-management API for the configured
 *  sender and returns every template it reports, with each one's real
 *  approval status/category/body — never a hardcoded "these names are
 *  approved" list. Excludes nothing itself (the caller decides whether to
 *  filter out AUTHENTICATION-category / non-APPROVED rows for the
 *  broadcast picker — see WhatsAppTemplateCache.isAuthTemplate). */
export async function listWhatsAppTemplates(): Promise<ListTemplatesResult> {
  const config = getConfig();
  if (!config) return { ok: false, code: "CONFIG_MISSING", error: WHATSAPP_NOT_CONFIGURED_MESSAGE };

  try {
    const res = await fetch(`${config.baseUrl}/whatsapp/1/senders/${encodeURIComponent(config.sender)}/templates`, {
      method: "GET",
      headers: authHeaders(config.apiKey),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[whatsapp:infobip] list templates failed", { status: res.status, body: text.slice(0, 300) });
      return { ok: false, code: "PROVIDER_FAILURE", error: "Couldn't fetch WhatsApp templates from Infobip right now." };
    }

    const data = (await res.json()) as unknown;
    const rawList: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown>)?.templates)
        ? ((data as Record<string, unknown>).templates as unknown[])
        : Array.isArray((data as Record<string, unknown>)?.data)
          ? ((data as Record<string, unknown>).data as unknown[])
          : [];

    if (rawList.length === 0 && data && typeof data === "object" && Object.keys(data).length > 0) {
      // Got a response, but not a shape we recognize as a template list —
      // report this honestly rather than silently returning "no templates".
      console.error("[whatsapp:infobip] template list response shape not recognized", Object.keys(data as object));
      return {
        ok: false,
        code: "UNRECOGNIZED_RESPONSE",
        error: "Infobip returned a template list in a format this app doesn't recognize yet — register templates manually below, or check the server log for the raw response shape.",
      };
    }

    const templates: ParsedWhatsAppTemplate[] = rawList.map((raw) => {
      const item = raw as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name : typeof item.templateName === "string" ? item.templateName : "";
      const language = typeof item.language === "string" ? item.language : "en";
      const category = typeof item.category === "string" ? item.category : null;
      const status = typeof item.status === "string" ? item.status : typeof item.approvalStatus === "string" ? (item.approvalStatus as string) : null;
      const bodyText = extractBodyText(item);
      const structure = item.structure as Record<string, unknown> | undefined;
      const structureBody = structure?.body as Record<string, unknown> | undefined;
      const declaredPlaceholders = Array.isArray(structureBody?.placeholders) ? (structureBody!.placeholders as unknown[]).length : 0;
      const variableCount = Math.max(countPlaceholders(bodyText), declaredPlaceholders);
      return {
        name,
        language,
        category,
        status,
        bodyText,
        variableCount,
        isAuthTemplate: (category || "").toUpperCase() === "AUTHENTICATION",
      };
    }).filter((t) => t.name);

    return { ok: true, templates };
  } catch (err) {
    console.error("[whatsapp:infobip] network error listing templates", { message: err instanceof Error ? err.message : String(err) });
    return { ok: false, code: "PROVIDER_FAILURE", error: "Couldn't reach Infobip to fetch WhatsApp templates." };
  }
}

// ---------------------------------------------------------------------------
// Sending — template messages (the only kind sent proactively/broadcast; see
// checkFreeformEligibility below for why free-form is never used here yet).
// ---------------------------------------------------------------------------

export interface SendWhatsAppTemplateOptions {
  toE164: string;
  templateName: string;
  language: string;
  placeholders: string[];
  /** Delivery-log category — see WhatsAppDelivery.type in schema.prisma. */
  type: string;
  vendorId?: string;
  eventId?: string;
  /** Same idempotency contract as lib/email/core.ts sendEmail's dedupeKey —
   *  a second call with the same key is recognized as a retry of the SAME
   *  send (via WhatsAppDelivery.dedupeKey's unique constraint) and is
   *  skipped rather than sending a duplicate WhatsApp message. */
  dedupeKey?: string;
}

async function logQueued(opts: SendWhatsAppTemplateOptions, toPhone: string): Promise<string | null> {
  if (!opts.dedupeKey) return null;
  try {
    const row = await prisma.whatsAppDelivery.create({
      data: {
        type: opts.type,
        vendorId: opts.vendorId,
        eventId: opts.eventId,
        toPhone,
        templateName: opts.templateName,
        status: "QUEUED",
        dedupeKey: opts.dedupeKey,
      },
    });
    return row.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return "DUPLICATE";
    }
    throw err;
  }
}

async function logOutcome(
  rowId: string | null,
  opts: SendWhatsAppTemplateOptions,
  toPhone: string,
  outcome: { status: "SENT" | "FAILED"; providerMessageId?: string; failReason?: string }
) {
  const data = {
    status: outcome.status,
    ...(outcome.status === "SENT" ? { sentAt: new Date() } : {}),
    ...(outcome.providerMessageId ? { providerMessageId: outcome.providerMessageId } : {}),
    ...(outcome.failReason ? { failReason: outcome.failReason.slice(0, 500) } : {}),
  };
  if (rowId) {
    await prisma.whatsAppDelivery.update({ where: { id: rowId }, data }).catch(() => {});
  } else {
    await prisma.whatsAppDelivery
      .create({ data: { type: opts.type, vendorId: opts.vendorId, eventId: opts.eventId, toPhone, templateName: opts.templateName, ...data } })
      .catch(() => {});
  }
}

export type SendWhatsAppResult = { ok: true; skipped?: boolean; whatsAppDeliveryId: string | null } | { ok: false; error: string };

/** Sends one approved-template WhatsApp message and records it in
 *  WhatsAppDelivery, mirroring lib/email/core.ts sendEmail's never-throws /
 *  always-logged contract exactly. */
export async function sendWhatsAppTemplate(opts: SendWhatsAppTemplateOptions): Promise<SendWhatsAppResult> {
  const toPhone = opts.toE164;
  const rowId = await logQueued(opts, toPhone);
  if (rowId === "DUPLICATE") return { ok: true, skipped: true, whatsAppDeliveryId: null };

  const config = getConfig();
  if (!config) {
    await logOutcome(rowId, opts, toPhone, { status: "FAILED", failReason: WHATSAPP_NOT_CONFIGURED_MESSAGE });
    return { ok: false, error: WHATSAPP_NOT_CONFIGURED_MESSAGE };
  }

  const messageId = crypto.randomUUID();
  try {
    const res = await fetch(`${config.baseUrl}/whatsapp/1/message/template`, {
      method: "POST",
      headers: authHeaders(config.apiKey),
      body: JSON.stringify({
        messages: [
          {
            from: config.sender,
            to: toInfobipMsisdn(toPhone),
            messageId,
            content: {
              templateName: opts.templateName,
              templateData: { body: { placeholders: opts.placeholders } },
              language: opts.language,
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[whatsapp:infobip] send failed", { status: res.status, body: text.slice(0, 300) });
      await logOutcome(rowId, opts, toPhone, { status: "FAILED", failReason: `Infobip ${res.status}: ${text.slice(0, 200)}` });
      return { ok: false, error: "WhatsApp send failed." };
    }

    const data = (await res.json().catch(() => ({}))) as { messages?: { messageId?: string; to?: string }[]; messageId?: string };
    const providerMessageId = data.messages?.[0]?.messageId || data.messageId || messageId;
    await logOutcome(rowId, opts, toPhone, { status: "SENT", providerMessageId });
    return { ok: true, whatsAppDeliveryId: rowId };
  } catch (err) {
    console.error("[whatsapp:infobip] network error on send", { message: err instanceof Error ? err.message : String(err) });
    await logOutcome(rowId, opts, toPhone, { status: "FAILED", failReason: err instanceof Error ? err.message : "Unknown error" });
    return { ok: false, error: "Couldn't reach Infobip to send this WhatsApp message." };
  }
}

// ---------------------------------------------------------------------------
// Free-form eligibility — deliberately, permanently conservative.
//
// Meta only allows a free-form (non-template) WhatsApp message to a
// recipient who is currently inside a 24-hour "customer service window"
// opened by THAT RECIPIENT messaging the business first. Determining that
// honestly requires tracking inbound WhatsApp messages (an Infobip inbound
// webhook + receiver), which this codebase does not have at all — there is
// no inbound-message table, no webhook route, nothing. Rather than guess or
// assume a window is open, this always reports "not eligible", so the
// Admin Communications Center can only ever broadcast via an approved
// template — exactly the safe behavior the spec requires ("do not attempt
// to bypass Meta template rules", "do not silently send illegal
// messages"). If inbound-message tracking is built later, this is the one
// function to change; everything that calls it already handles a mixed
// eligible/ineligible audience correctly.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- vendorId is kept in the signature so every call site already passes real context, ready for when inbound-message tracking lets this actually vary by recipient
export function isFreeformEligible(vendorId: string): boolean {
  return false;
}
