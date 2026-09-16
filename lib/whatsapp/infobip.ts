import "server-only";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

// Infobip WhatsApp Business API — the SOLE Infobip integration in this
// codebase. DAH has moved completely off Infobip's SMS 2FA API (and off
// Twilio, which was never actually used here despite some earlier stray
// comments claiming otherwise) — phone verification, broadcast
// Communications, and everything else Infobip-related all go through
// this one WhatsApp channel. This module (the connection/send/list
// primitives) reads exactly three env vars: INFOBIP_WHATSAPP_BASE_URL,
// INFOBIP_WHATSAPP_API_KEY, INFOBIP_WHATSAPP_SENDER (the WhatsApp
// Business number actually registered/approved on that account, MSISDN,
// no leading "+"). Phone verification additionally reads two more,
// scoped to lib/whatsapp/otp.ts only: INFOBIP_WHATSAPP_AUTH_TEMPLATE /
// INFOBIP_WHATSAPP_AUTH_TEMPLATE_LANGUAGE (which of the account's
// approved templates to use for OTP — deliberately explicit, never
// auto-picked).
//
// IMPORTANT — this module was built against Infobip's publicly documented
// request/response shape for sending a template message (confirmed via
// Infobip's own docs: POST {baseUrl}/whatsapp/1/message/template with a
// `messages[]` envelope, `content.templateName` /
// `content.templateData.body.placeholders` / `content.language`, and for
// an AUTHENTICATION template's Copy Code button, a `content.templateData
// .buttons` array of `{ type: "URL", parameter: <code> }` — Infobip
// represents the button's dynamic parameter this way regardless of the
// button's own display type in the template definition; the code is
// passed as BOTH the body placeholder and the button parameter). The
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
  const baseUrl = process.env.INFOBIP_WHATSAPP_BASE_URL;
  const apiKey = process.env.INFOBIP_WHATSAPP_API_KEY;
  const sender = process.env.INFOBIP_WHATSAPP_SENDER;
  if (!baseUrl || !apiKey || !sender) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, sender: sender.replace(/^\+/, "") };
}

export function isWhatsAppConfigured(): boolean {
  return getConfig() !== null;
}

export const WHATSAPP_NOT_CONFIGURED_MESSAGE =
  "WhatsApp isn't configured yet — set INFOBIP_WHATSAPP_BASE_URL, INFOBIP_WHATSAPP_API_KEY, and INFOBIP_WHATSAPP_SENDER to send real messages.";

function toInfobipMsisdn(phoneE164: string): string {
  return phoneE164.replace(/^\+/, "");
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `App ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
}

export type RawTemplateListResult = { ok: true; raw: unknown } | { ok: false; code: "CONFIG_MISSING" | "PROVIDER_FAILURE"; error: string };

/** Diagnostic-only: the exact same call listWhatsAppTemplates() makes, but
 *  returns Infobip's response completely unparsed — no shape assumptions,
 *  no field-name guessing. Exists so a real production response can be
 *  inspected directly (via the admin-only debug route) when the parsed
 *  result looks wrong (e.g. every template showing 0 variables) — the
 *  fastest way to find out whether the list endpoint even returns body/
 *  structure data at all, or whether a per-template detail call is
 *  required, without guessing further. Never used by any real send/sync
 *  path — listWhatsAppTemplates() remains the one parsed source of truth. */
export async function fetchRawTemplateList(): Promise<RawTemplateListResult> {
  const config = getConfig();
  if (!config) return { ok: false, code: "CONFIG_MISSING", error: WHATSAPP_NOT_CONFIGURED_MESSAGE };
  try {
    const res = await fetch(`${config.baseUrl}/whatsapp/1/senders/${encodeURIComponent(config.sender)}/templates`, {
      method: "GET",
      headers: authHeaders(config.apiKey),
    });
    const raw = await res.json().catch(async () => ({ __nonJsonBody: (await res.text().catch(() => "")).slice(0, 2000) }));
    if (!res.ok) {
      return { ok: false, code: "PROVIDER_FAILURE", error: `Infobip returned ${res.status}` };
    }
    return { ok: true, raw };
  } catch (err) {
    return { ok: false, code: "PROVIDER_FAILURE", error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Template listing — live-synced, never hardcoded.
// ---------------------------------------------------------------------------

export interface ParsedWhatsAppTemplateButton {
  type: string; // e.g. URL, QUICK_REPLY, PHONE_NUMBER — whatever Infobip reports, never invented
  text: string | null;
  url: string | null; // for a URL button; may contain a literal "{{1}}" segment if the button has a dynamic parameter
  hasPlaceholder: boolean; // true when `url` contains a {{n}} token — the button needs a `parameter` at send time
}

export interface ParsedWhatsAppTemplate {
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  bodyText: string | null;
  headerText: string | null;
  footerText: string | null;
  buttons: ParsedWhatsAppTemplateButton[];
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

function findComponent(item: Record<string, unknown>, type: string): Record<string, unknown> | undefined {
  const components = item.components as unknown[] | undefined;
  if (!Array.isArray(components)) return undefined;
  return components.find(
    (c) => typeof c === "object" && c !== null && (c as Record<string, unknown>).type === type
  ) as Record<string, unknown> | undefined;
}

/** Same best-effort, several-shapes-tried approach as extractBodyText, for
 *  the optional header component. Returns null (not "") for "no header" —
 *  admin UI must treat null as "this template has no header", not as an
 *  empty one. */
function extractHeaderText(item: Record<string, unknown>): string | null {
  const structure = item.structure as Record<string, unknown> | undefined;
  const structureHeader = structure?.header as Record<string, unknown> | string | undefined;
  if (typeof structureHeader === "string") return structureHeader;
  if (typeof structureHeader?.text === "string") return structureHeader.text;

  const headerComponent = findComponent(item, "HEADER");
  if (typeof headerComponent?.text === "string") return headerComponent.text;

  const header = item.header as Record<string, unknown> | string | undefined;
  if (typeof header === "string") return header;
  if (typeof header?.text === "string") return header.text;

  return null;
}

function extractFooterText(item: Record<string, unknown>): string | null {
  const structure = item.structure as Record<string, unknown> | undefined;
  const structureFooter = structure?.footer as Record<string, unknown> | string | undefined;
  if (typeof structureFooter === "string") return structureFooter;
  if (typeof structureFooter?.text === "string") return structureFooter.text;

  const footerComponent = findComponent(item, "FOOTER");
  if (typeof footerComponent?.text === "string") return footerComponent.text;

  const footer = item.footer as Record<string, unknown> | string | undefined;
  if (typeof footer === "string") return footer;
  if (typeof footer?.text === "string") return footer.text;

  return null;
}

/** Best-effort extraction of a template's real registered buttons. Tries
 *  Infobip's `structure.buttons` array, a `components[].{type:"BUTTONS"}`
 *  wrapper with a nested `buttons` array (Meta/WhatsApp's own component
 *  shape), and a bare top-level `buttons` array — in that order — and
 *  returns [] (never a guess) if none match. Every returned button's
 *  `url`/`text` is exactly what Infobip reported; `hasPlaceholder` is
 *  derived, never asserted. */
function extractButtons(item: Record<string, unknown>): ParsedWhatsAppTemplateButton[] {
  const structure = item.structure as Record<string, unknown> | undefined;
  let rawButtons: unknown[] | undefined = Array.isArray(structure?.buttons) ? (structure!.buttons as unknown[]) : undefined;

  if (!rawButtons) {
    const buttonsComponent = findComponent(item, "BUTTONS");
    if (Array.isArray(buttonsComponent?.buttons)) rawButtons = buttonsComponent!.buttons as unknown[];
  }

  if (!rawButtons && Array.isArray(item.buttons)) rawButtons = item.buttons as unknown[];
  if (!Array.isArray(rawButtons)) return [];

  return rawButtons
    .map((raw) => {
      if (typeof raw !== "object" || raw === null) return null;
      const b = raw as Record<string, unknown>;
      const type = typeof b.type === "string" ? b.type : "UNKNOWN";
      const text = typeof b.text === "string" ? b.text : null;
      const url = typeof b.url === "string" ? b.url : typeof b.parameter === "string" ? b.parameter : null;
      const hasPlaceholder = typeof url === "string" && /\{\{\s*\d+\s*\}\}/.test(url);
      return { type, text, url, hasPlaceholder };
    })
    .filter((b): b is ParsedWhatsAppTemplateButton => b !== null);
}

/** JSON-serializes a template's parsed buttons for WhatsAppTemplateCache.buttonsJson.
 *  Shared by every sync call site (otp.ts's own cache refresh and the
 *  Template Registry's) so the exact same shape is stored everywhere. */
export function serializeButtons(buttons: ParsedWhatsAppTemplateButton[]): string | null {
  return buttons.length > 0 ? JSON.stringify(buttons) : null;
}

export function parseButtonsJson(json: string | null): ParsedWhatsAppTemplateButton[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as ParsedWhatsAppTemplateButton[]) : [];
  } catch {
    return [];
  }
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
      const headerText = extractHeaderText(item);
      const footerText = extractFooterText(item);
      const buttons = extractButtons(item);
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
        headerText,
        footerText,
        buttons,
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

export interface WhatsAppTemplateButton {
  type: string;
  parameter: string;
}

export interface SendWhatsAppTemplateOptions {
  toE164: string;
  templateName: string;
  language: string;
  placeholders: string[];
  /** Button components with dynamic parameters — e.g. an AUTHENTICATION
   *  template's "Copy Code" button, which (per Infobip's WhatsApp API)
   *  needs the same code as the body placeholder passed again here as
   *  `{ type: "URL", parameter: code }`. Omitted entirely for templates
   *  with no dynamic buttons. */
  buttons?: WhatsAppTemplateButton[];
  /** Delivery-log category — see WhatsAppDelivery.type in schema.prisma. */
  type: string;
  vendorId?: string;
  eventId?: string;
  /** Automatic-notification bookkeeping only (never set by the OTP or
   *  Communications Center call sites) — see WhatsAppDelivery.useCase/
   *  triggerType/applicationId/paymentId in schema.prisma. */
  useCase?: string;
  triggerType?: string;
  applicationId?: string;
  paymentId?: string;
  /** Same idempotency contract as lib/email/core.ts sendEmail's dedupeKey —
   *  a second call with the same key is recognized as a retry of the SAME
   *  send (via WhatsAppDelivery.dedupeKey's unique constraint) and is
   *  skipped rather than sending a duplicate WhatsApp message. */
  dedupeKey?: string;
  /** Values that must NEVER appear in a server log for this send — e.g. an
   *  OTP code. Any log line this module would otherwise write about this
   *  send (including a raw Infobip error body, which could echo the
   *  submitted payload back) has these values redacted first. Never
   *  affects what's actually sent to Infobip or stored in
   *  WhatsAppDelivery.failReason — only console output. */
  sensitiveValues?: string[];
}

function redact(text: string, sensitiveValues: string[] | undefined): string {
  if (!sensitiveValues || sensitiveValues.length === 0) return text;
  let out = text;
  for (const value of sensitiveValues) {
    if (value) out = out.split(value).join("[REDACTED]");
  }
  return out;
}

/** Pure request-body builder, split out from sendWhatsAppTemplate so the
 *  exact JSON shape sent to Infobip can be unit-tested without a live
 *  account or network access. */
export function buildTemplateMessagePayload(opts: {
  from: string;
  to: string;
  messageId: string;
  templateName: string;
  language: string;
  placeholders: string[];
  buttons?: WhatsAppTemplateButton[];
}) {
  return {
    messages: [
      {
        from: opts.from,
        to: opts.to,
        messageId: opts.messageId,
        content: {
          templateName: opts.templateName,
          templateData: {
            body: { placeholders: opts.placeholders },
            ...(opts.buttons && opts.buttons.length > 0 ? { buttons: opts.buttons } : {}),
          },
          language: opts.language,
        },
      },
    ],
  };
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
        useCase: opts.useCase,
        triggerType: opts.triggerType,
        applicationId: opts.applicationId,
        paymentId: opts.paymentId,
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
      .create({
        data: {
          type: opts.type,
          vendorId: opts.vendorId,
          eventId: opts.eventId,
          toPhone,
          templateName: opts.templateName,
          useCase: opts.useCase,
          triggerType: opts.triggerType,
          applicationId: opts.applicationId,
          paymentId: opts.paymentId,
          ...data,
        },
      })
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
      body: JSON.stringify(
        buildTemplateMessagePayload({
          from: config.sender,
          to: toInfobipMsisdn(toPhone),
          messageId,
          templateName: opts.templateName,
          language: opts.language,
          placeholders: opts.placeholders,
          buttons: opts.buttons,
        })
      ),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const safeText = redact(text, opts.sensitiveValues).slice(0, 300);
      // status + a redacted, truncated response body only — the request
      // Authorization header (the API key) is never logged, and any
      // sensitiveValues (e.g. an OTP code) are stripped even if Infobip's
      // own error body happened to echo the submitted payload back.
      console.error("[whatsapp:infobip] send failed", { status: res.status, body: safeText });
      await logOutcome(rowId, opts, toPhone, { status: "FAILED", failReason: `Infobip ${res.status}: ${safeText.slice(0, 200)}` });
      return { ok: false, error: "WhatsApp send failed." };
    }

    const data = (await res.json().catch(() => ({}))) as { messages?: { messageId?: string; to?: string }[]; messageId?: string };
    const providerMessageId = data.messages?.[0]?.messageId || data.messageId || messageId;
    await logOutcome(rowId, opts, toPhone, { status: "SENT", providerMessageId });
    return { ok: true, whatsAppDeliveryId: rowId };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const safeMessage = redact(rawMessage, opts.sensitiveValues);
    console.error("[whatsapp:infobip] network error on send", { message: safeMessage });
    await logOutcome(rowId, opts, toPhone, { status: "FAILED", failReason: safeMessage });
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
