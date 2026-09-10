import "server-only";
import Twilio from "twilio";

// Twilio Verify owns the actual OTP: generating it, storing it, expiring it,
// and rate limiting/blocking abuse (Fraud Guard) — we never generate or
// store a code ourselves. This module is just a thin, error-safe wrapper so
// the rest of the app never touches the Twilio SDK or its raw errors
// directly (see PART 41 provider-abstraction requirement).
//
// Auth uses an API Key (TWILIO_API_KEY_SID/SECRET) scoped to the account
// (TWILIO_ACCOUNT_SID), not the account's master auth token — the
// recommended approach for server-side application code.

function getClient(): { client: ReturnType<typeof Twilio>; serviceSid: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !apiKeySid || !apiKeySecret || !serviceSid) return null;
  const client = Twilio(apiKeySid, apiKeySecret, { accountSid });
  return { client, serviceSid };
}

export function isSmsConfigured(): boolean {
  return getClient() !== null;
}

export const SMS_NOT_CONFIGURED_MESSAGE = "Mobile verification isn't configured yet — please contact DAH.";

export type SendOtpResult = { ok: true } | { ok: false; error: string };

/** Starts a Twilio Verify SMS check for this number. Twilio itself enforces
 *  a resend cooldown and per-number send limits (Fraud Guard) — a caller
 *  hitting those gets a clean error back here, not a raw provider message. */
export async function sendPhoneOtp(phoneE164: string): Promise<SendOtpResult> {
  const ctx = getClient();
  if (!ctx) {
    console.error("[sms] Twilio not configured — cannot send OTP");
    return { ok: false, error: SMS_NOT_CONFIGURED_MESSAGE };
  }
  try {
    await ctx.client.verify.v2.services(ctx.serviceSid).verifications.create({ to: phoneE164, channel: "sms" });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mapTwilioError(err) };
  }
}

export type CheckOtpResult = { ok: true; approved: boolean } | { ok: false; error: string };

/** Checks a code against Twilio's own record of the last verification sent
 *  to this number. Twilio caps wrong-code attempts per verification itself
 *  (error 60202) — we don't need to track attempt counts ourselves. */
export async function checkPhoneOtp(phoneE164: string, code: string): Promise<CheckOtpResult> {
  const ctx = getClient();
  if (!ctx) return { ok: false, error: SMS_NOT_CONFIGURED_MESSAGE };
  try {
    const check = await ctx.client.verify.v2.services(ctx.serviceSid).verificationChecks.create({ to: phoneE164, code });
    return { ok: true, approved: check.status === "approved" };
  } catch (err) {
    return { ok: false, error: mapTwilioError(err) };
  }
}

// Converts Twilio's own error codes into clean, non-technical DAH copy —
// never surfaces a raw Twilio error/status to a vendor.
// https://www.twilio.com/docs/api/errors
function mapTwilioError(err: unknown): string {
  const code = (err as { code?: number } | null)?.code;
  switch (code) {
    case 60200:
      return "That doesn't look like a valid phone number.";
    case 60203:
      return "Please wait a moment before requesting another code.";
    case 60202:
      return "Too many incorrect attempts. Please request a new code.";
    case 60212:
    case 60410:
    case 60605:
      return "Too many requests for this number. Please try again later.";
    case 60223:
    case 60226:
      return "This number can't receive an SMS code right now. Please try a different number or contact DAH.";
    case 20404:
      return "That code has expired or is no longer valid. Please request a new one.";
    case 60598:
      return "This phone number has been temporarily blocked from verification due to unusual activity. Please contact DAH.";
    default:
      console.error("[sms] Twilio error", err);
      return "We couldn't process your verification right now. Please try again shortly.";
  }
}
