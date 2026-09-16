import "server-only";
import crypto from "crypto";
import { prisma } from "../prisma";
import { hashToken, isExpired } from "../tokens";
import { isWhatsAppConfigured, listWhatsAppTemplates, sendWhatsAppTemplate, WHATSAPP_NOT_CONFIGURED_MESSAGE } from "./infobip";

// Phone verification over WhatsApp — replaces the retired Infobip 2FA (SMS)
// integration (lib/sms/infobip.ts, deleted). Infobip's WhatsApp channel has
// no hosted PIN-management API the way the SMS 2FA product did: there is
// no "send a pin, get a pinId, ask Infobip if it was right" round trip.
// Instead DAH generates the one-time code itself, stores only its SHA-256
// hash (same never-store-the-raw-secret pattern as
// PasswordResetToken/EmailChangeToken — see lib/tokens.ts), sends it as
// the {{1}} placeholder of an approved WhatsApp AUTHENTICATION-category
// template, and verifies the vendor's typed code against that hash. DAH
// also now caps wrong-code attempts itself (phoneOtpAttempts) — Infobip's
// 2FA API used to do this for us.

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const AUTH_TEMPLATE_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function generateCode(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return n.toString().padStart(OTP_LENGTH, "0");
}

interface AuthTemplateRef {
  name: string;
  language: string;
}

/** Finds the account's approved WhatsApp AUTHENTICATION-category template
 *  — never a hardcoded name (there is deliberately no 4th env var for
 *  this; the whole point is DAH's real approved template is discovered
 *  live from Infobip, same as the broadcast template picker). Reads from
 *  the local WhatsAppTemplateCache first (populated by this function, or
 *  by an admin visiting Communications -> Templates) and only makes a
 *  live Infobip call when the cache is empty or older than an hour — a
 *  phone-verification send shouldn't pay for a full template-list round
 *  trip on every single OTP. Falls back to a stale cached entry rather
 *  than failing outright if the live refresh itself fails (e.g. a
 *  transient Infobip outage shouldn't block verification for vendors
 *  whose template hasn't changed). */
async function getAuthTemplate(): Promise<AuthTemplateRef | null> {
  const cached = await prisma.whatsAppTemplateCache.findFirst({
    where: { isAuthTemplate: true },
    orderBy: { syncedAt: "desc" },
  });
  if (cached && Date.now() - cached.syncedAt.getTime() < AUTH_TEMPLATE_CACHE_MAX_AGE_MS) {
    return { name: cached.name, language: cached.language };
  }

  const result = await listWhatsAppTemplates();
  if (!result.ok) {
    return cached ? { name: cached.name, language: cached.language } : null;
  }

  for (const t of result.templates) {
    await prisma.whatsAppTemplateCache.upsert({
      where: { name_language: { name: t.name, language: t.language } },
      update: { category: t.category, status: t.status, bodyText: t.bodyText, variableCount: t.variableCount, isAuthTemplate: t.isAuthTemplate, source: "SYNCED", syncedAt: new Date() },
      create: { name: t.name, language: t.language, category: t.category, status: t.status, bodyText: t.bodyText, variableCount: t.variableCount, isAuthTemplate: t.isAuthTemplate, source: "SYNCED" },
    });
  }

  const authTemplate = result.templates.find((t) => t.isAuthTemplate);
  return authTemplate ? { name: authTemplate.name, language: authTemplate.language } : null;
}

export type SendOtpResult = { ok: true } | { ok: false; code: "CONFIG_MISSING" | "NO_AUTH_TEMPLATE" | "PROVIDER_FAILURE"; error: string };

/** Generates a fresh code, stores its hash + expiry on the vendor row, and
 *  sends it via the approved WhatsApp Authentication template. A fresh
 *  send/resend always overwrites the prior attempt (same contract the old
 *  Infobip 2FA pinId replacement had) and resets the attempt counter. */
export async function sendWhatsAppOtp(vendorId: string, phoneE164: string): Promise<SendOtpResult> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, code: "CONFIG_MISSING", error: WHATSAPP_NOT_CONFIGURED_MESSAGE };
  }

  const template = await getAuthTemplate();
  if (!template) {
    console.error("[whatsapp:otp] no AUTHENTICATION-category template found on this Infobip account");
    return { ok: false, code: "NO_AUTH_TEMPLATE", error: "Mobile verification isn't configured yet — please contact DAH." };
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.vendor.update({
    where: { id: vendorId },
    data: { phoneOtpCodeHash: hashToken(code), phoneOtpPhone: phoneE164, phoneOtpExpiresAt: expiresAt, phoneOtpAttempts: 0 },
  });

  // NOTE — button parameter: Meta's WhatsApp Authentication templates
  // typically render a "Copy Code" (or one-tap autofill) button whose
  // component may itself need the code as a parameter, separate from the
  // body placeholder. This could not be confirmed against a live Infobip
  // account while this was built (see lib/whatsapp/infobip.ts's own
  // honesty note), so only the body placeholder is sent here. If a real
  // send shows the button rendering without the code, extend
  // sendWhatsAppTemplate's request with a `buttons` array — the
  // request-building code (lib/whatsapp/infobip.ts) is the one place to
  // change.
  const result = await sendWhatsAppTemplate({
    toE164: phoneE164,
    templateName: template.name,
    language: template.language,
    placeholders: [code],
    type: "PHONE_VERIFICATION",
    vendorId,
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
 *  don't cap wrong-code attempts for us. A wrong guess increments the
 *  counter; it is never decremented or reset except by a fresh send. */
export async function checkWhatsAppOtp(vendorId: string, code: string): Promise<CheckOtpResult> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor?.phoneOtpCodeHash || !vendor.phoneOtpExpiresAt) {
    return { ok: false, error: "Please request a new code." };
  }
  if (isExpired(vendor.phoneOtpExpiresAt)) {
    return { ok: false, error: "That code has expired. Please request a new one." };
  }
  if (vendor.phoneOtpAttempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  const matches = hashToken(code) === vendor.phoneOtpCodeHash;
  if (!matches) {
    await prisma.vendor.update({ where: { id: vendorId }, data: { phoneOtpAttempts: { increment: 1 } } });
    return { ok: true, approved: false };
  }
  return { ok: true, approved: true };
}
