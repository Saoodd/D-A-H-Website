import "server-only";
import { randomInt, createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../prisma";
import { isExpired } from "../tokens";
import { isWhatsAppConfigured, listWhatsAppTemplates, sendWhatsAppTemplate, WHATSAPP_NOT_CONFIGURED_MESSAGE } from "./infobip";

// Phone verification over WhatsApp — replaces the retired Infobip 2FA (SMS)
// integration (lib/sms/infobip.ts, deleted). Infobip's WhatsApp channel has
// no hosted PIN-management API the way the SMS 2FA product did: there is
// no "send a pin, get a pinId, ask Infobip if it was right" round trip.
// Instead DAH generates the one-time code itself, stores only a KEYED
// (HMAC) hash of it — never a bare SHA-256, see computeOtpHmac below —
// sends it as the {{1}} placeholder AND the Copy Code button parameter of
// an approved WhatsApp AUTHENTICATION-category template, and verifies the
// vendor's typed code against that hash in constant time. DAH also now
// caps wrong-code attempts itself (phoneOtpAttempts) — Infobip's 2FA API
// used to do this for us.

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const AUTH_TEMPLATE_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

const GENERIC_CONFIG_ERROR = "Mobile verification isn't configured yet — please contact DAH.";

function generateCode(): string {
  // crypto.randomInt is a CSPRNG (unlike Math.random) — required for
  // anything security-sensitive, even a short numeric code.
  const n = randomInt(0, 10 ** OTP_LENGTH);
  return n.toString().padStart(OTP_LENGTH, "0");
}

/** Keyed (HMAC-SHA256) hash of a 6-digit code, bound to the phone number
 *  it was issued for. A bare SHA-256 hash of a 6-digit code is trivially
 *  brute-forced offline — only 1,000,000 possibilities, instant to
 *  exhaust — if the database is ever exposed. HMAC with a server-only
 *  secret (AUTH_SECRET, the same secret already used to sign admin/vendor
 *  session cookies — see lib/auth.ts) means an attacker who obtains only
 *  the database, not the running server's environment, cannot recover the
 *  code by brute force at all: they would also need AUTH_SECRET, which is
 *  never stored anywhere the database itself could leak. Binding the
 *  phone number into the HMAC input is cheap extra domain separation
 *  (two different vendors' codes can never collide to the same hash even
 *  if they happened to pick the same 6 digits at the same moment). */
function computeOtpHmac(code: string, phoneE164: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — required for OTP hashing");
  return createHmac("sha256", secret).update(`${phoneE164}:${code}`).digest("hex");
}

/** Constant-time comparison of two hex-encoded HMAC-SHA256 digests. A
 *  naive `===` string comparison short-circuits on the first differing
 *  byte, which leaks timing information an attacker could in principle
 *  use to recover the hash (and thus, offline, the code) faster than
 *  brute force. Both inputs are always fixed-length (64 hex chars) here;
 *  a length mismatch — which should never actually happen — fails closed
 *  rather than throwing. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

interface AuthTemplateRef {
  name: string;
  language: string;
}

type AuthTemplateFailureCode = "AUTH_TEMPLATE_NOT_CONFIGURED" | "AUTH_TEMPLATE_NOT_APPROVED";
type AuthTemplateLookup = { ok: true; template: AuthTemplateRef } | { ok: false; code: AuthTemplateFailureCode; error: string };

/** Resolves DAH's phone-verification WhatsApp template DETERMINISTICALLY
 *  from INFOBIP_WHATSAPP_AUTH_TEMPLATE / INFOBIP_WHATSAPP_AUTH_TEMPLATE_LANGUAGE
 *  — never "whichever AUTHENTICATION-category template happens to be
 *  first" on the account (there may eventually be more than one). Verifies
 *  the configured template actually exists and is approved by checking the
 *  local WhatsAppTemplateCache (refreshed live from Infobip when
 *  missing/stale — the same cache the broadcast template picker uses), so
 *  a typo'd or since-rejected template name fails loudly and immediately
 *  rather than silently substituting a different template. */
async function getConfiguredAuthTemplate(): Promise<AuthTemplateLookup> {
  const name = process.env.INFOBIP_WHATSAPP_AUTH_TEMPLATE;
  const language = process.env.INFOBIP_WHATSAPP_AUTH_TEMPLATE_LANGUAGE;
  if (!name || !language) {
    console.error("[whatsapp:otp] INFOBIP_WHATSAPP_AUTH_TEMPLATE / INFOBIP_WHATSAPP_AUTH_TEMPLATE_LANGUAGE not set");
    return { ok: false, code: "AUTH_TEMPLATE_NOT_CONFIGURED", error: GENERIC_CONFIG_ERROR };
  }

  let cached = await prisma.whatsAppTemplateCache.findUnique({ where: { name_language: { name, language } } });
  const isFresh = cached != null && Date.now() - cached.syncedAt.getTime() < AUTH_TEMPLATE_CACHE_MAX_AGE_MS;

  if (!isFresh) {
    const result = await listWhatsAppTemplates();
    if (result.ok) {
      for (const t of result.templates) {
        await prisma.whatsAppTemplateCache.upsert({
          where: { name_language: { name: t.name, language: t.language } },
          update: { category: t.category, status: t.status, bodyText: t.bodyText, variableCount: t.variableCount, isAuthTemplate: t.isAuthTemplate, source: "SYNCED", syncedAt: new Date() },
          create: { name: t.name, language: t.language, category: t.category, status: t.status, bodyText: t.bodyText, variableCount: t.variableCount, isAuthTemplate: t.isAuthTemplate, source: "SYNCED" },
        });
      }
      cached = await prisma.whatsAppTemplateCache.findUnique({ where: { name_language: { name, language } } });
    }
    // If the live refresh itself failed (e.g. a transient Infobip outage),
    // fall through and use whatever's cached — possibly stale, possibly
    // null — rather than blocking every phone verification on it.
  }

  if (!cached) {
    console.error(`[whatsapp:otp] configured template "${name}" (${language}) was not found on this Infobip account`);
    return { ok: false, code: "AUTH_TEMPLATE_NOT_CONFIGURED", error: GENERIC_CONFIG_ERROR };
  }
  if (!cached.isAuthTemplate) {
    console.error(`[whatsapp:otp] configured template "${name}" (${language}) is not an AUTHENTICATION-category template`);
    return { ok: false, code: "AUTH_TEMPLATE_NOT_APPROVED", error: GENERIC_CONFIG_ERROR };
  }
  // A recognized non-approved status blocks outright. A null/unrecognized
  // status (the template-list response didn't match a field name this
  // app's defensive parser knows — see lib/whatsapp/infobip.ts's own
  // honesty note) is logged but allowed through, rather than permanently
  // locking out phone verification over this app's own parsing
  // uncertainty rather than a real problem with the template.
  const status = (cached.status || "").toUpperCase();
  if (status && status !== "APPROVED") {
    console.error(`[whatsapp:otp] configured template "${name}" (${language}) status is "${cached.status}", not APPROVED`);
    return { ok: false, code: "AUTH_TEMPLATE_NOT_APPROVED", error: GENERIC_CONFIG_ERROR };
  }
  if (!status) {
    console.error(`[whatsapp:otp] couldn't confirm approval status of "${name}" (${language}) from Infobip's response — proceeding, but verify manually against the live account`);
  }

  return { ok: true, template: { name, language } };
}

export type SendOtpResult = { ok: true } | { ok: false; code: "CONFIG_MISSING" | AuthTemplateFailureCode | "PROVIDER_FAILURE"; error: string };

/** Generates a fresh code, stores its keyed hash + expiry on the vendor
 *  row, and sends it via the configured, verified WhatsApp Authentication
 *  template — as both the body placeholder and the Copy Code button
 *  parameter, so the button actually copies the same code shown in the
 *  message body. A fresh send/resend always overwrites the prior attempt
 *  and resets the attempt counter, invalidating whatever code was issued
 *  before. The raw code is never logged — see sensitiveValues below. */
export async function sendWhatsAppOtp(vendorId: string, phoneE164: string): Promise<SendOtpResult> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, code: "CONFIG_MISSING", error: WHATSAPP_NOT_CONFIGURED_MESSAGE };
  }

  const templateLookup = await getConfiguredAuthTemplate();
  if (!templateLookup.ok) return templateLookup;

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.vendor.update({
    where: { id: vendorId },
    data: { phoneOtpCodeHash: computeOtpHmac(code, phoneE164), phoneOtpPhone: phoneE164, phoneOtpExpiresAt: expiresAt, phoneOtpAttempts: 0 },
  });

  const result = await sendWhatsAppTemplate({
    toE164: phoneE164,
    templateName: templateLookup.template.name,
    language: templateLookup.template.language,
    placeholders: [code],
    buttons: [{ type: "URL", parameter: code }],
    type: "PHONE_VERIFICATION",
    vendorId,
    sensitiveValues: [code],
  });

  if (!result.ok) {
    return { ok: false, code: "PROVIDER_FAILURE", error: "We couldn't send the verification code right now. Please try again." };
  }
  return { ok: true };
}

export type CheckOtpResult = { ok: true; approved: boolean } | { ok: false; error: string };

/** Checks a typed code against the vendor's current in-flight OTP —
 *  self-managed expiry (OTP_TTL_MINUTES) and attempt cap (MAX_ATTEMPTS),
 *  since WhatsApp template sends (unlike the old Infobip 2FA PIN API)
 *  don't cap wrong-code attempts for us. Compares HMACs in constant time
 *  (safeEqualHex), never a plain `===`. A wrong guess increments the
 *  counter; it is never decremented or reset except by a fresh send. */
export async function checkWhatsAppOtp(vendorId: string, code: string): Promise<CheckOtpResult> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor?.phoneOtpCodeHash || !vendor.phoneOtpPhone || !vendor.phoneOtpExpiresAt) {
    return { ok: false, error: "Please request a new code." };
  }
  if (isExpired(vendor.phoneOtpExpiresAt)) {
    return { ok: false, error: "That code has expired. Please request a new one." };
  }
  if (vendor.phoneOtpAttempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  const candidateHash = computeOtpHmac(code, vendor.phoneOtpPhone);
  const matches = safeEqualHex(candidateHash, vendor.phoneOtpCodeHash);
  if (!matches) {
    await prisma.vendor.update({ where: { id: vendorId }, data: { phoneOtpAttempts: { increment: 1 } } });
    return { ok: true, approved: false };
  }
  return { ok: true, approved: true };
}
