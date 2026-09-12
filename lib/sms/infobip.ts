import "server-only";

// Infobip 2FA API v2 — owns the actual PIN: generating it, storing it,
// expiring it, and capping wrong-code attempts. We never generate or store
// an OTP ourselves; we only hold the `pinId` Infobip hands back from a send,
// so a later verify can be checked against it (see Vendor.phoneOtpPinId).
//
// Auth uses an API Key in the "App <key>" scheme (Infobip's standard for
// server-to-server calls) — never exposed to the browser, only ever read
// from env vars on the server.

function getConfig(): { baseUrl: string; apiKey: string; applicationId: string; messageId: string } | null {
  const baseUrl = process.env.INFOBIP_BASE_URL;
  const apiKey = process.env.INFOBIP_API_KEY;
  const applicationId = process.env.INFOBIP_2FA_APPLICATION_ID;
  const messageId = process.env.INFOBIP_2FA_MESSAGE_ID;
  if (!baseUrl || !apiKey || !applicationId || !messageId) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, applicationId, messageId };
}

export function isSmsConfigured(): boolean {
  return getConfig() !== null;
}

export const SMS_NOT_CONFIGURED_MESSAGE = "Mobile verification isn't configured yet — please contact DAH.";

// A structured failure reason lets the API route (and the frontend, via the
// API route's `code` field) tell a rate limit apart from a bad number apart
// from a provider outage — instead of the frontend having to pattern-match
// human-readable error text. Never conflate these: only RATE_LIMITED should
// ever start a resend countdown.
export type SmsFailureCode = "CONFIG_MISSING" | "INVALID_NUMBER" | "RATE_LIMITED" | "PROVIDER_FAILURE";

export type SendOtpResult = { ok: true; pinId: string } | { ok: false; code: SmsFailureCode; error: string };

// Infobip's messaging APIs take MSISDN without a leading "+"
// ("971501234567"), unlike the "+971501234567" E.164 form we store and
// normalize everywhere else in the app (see lib/phone.ts).
function toInfobipMsisdn(phoneE164: string): string {
  return phoneE164.replace(/^\+/, "");
}

interface InfobipErrorBody {
  requestError?: { serviceException?: { messageId?: string; text?: string } };
}

async function parseErrorBody(res: Response): Promise<{ messageId?: string; text?: string }> {
  try {
    const body = (await res.json()) as InfobipErrorBody;
    return {
      messageId: body?.requestError?.serviceException?.messageId,
      text: body?.requestError?.serviceException?.text,
    };
  } catch {
    return {};
  }
}

// Converts an Infobip HTTP failure into a structured failure category plus
// clean, non-technical DAH copy — never surfaces a raw Infobip status/error
// to a vendor. Safely logs status + error code + a sanitized message +
// which operation was attempted — never the API key, never an OTP.
async function mapInfobipFailure(operation: "send" | "verify", res: Response): Promise<{ code: SmsFailureCode; error: string }> {
  const { messageId, text } = await parseErrorBody(res);
  console.error("[sms:infobip] error", { operation, status: res.status, messageId, message: text?.slice(0, 200) });

  if (res.status === 429) {
    return { code: "RATE_LIMITED", error: "Please wait a moment before requesting another code." };
  }
  if (res.status === 400 && messageId && /msisdn|phone|number/i.test(messageId)) {
    return { code: "INVALID_NUMBER", error: "That doesn't look like a valid phone number." };
  }
  if (operation === "verify" && (res.status === 400 || res.status === 404)) {
    // pinId no longer exists / expired / already used on Infobip's side.
    return { code: "PROVIDER_FAILURE", error: "That code has expired or is no longer valid. Please request a new one." };
  }
  return { code: "PROVIDER_FAILURE", error: "We couldn't send the verification code right now. Please try again." };
}

/** Starts an Infobip 2FA PIN send to this number. Returns the `pinId` the
 *  caller must persist (server-side only) to check the code against later —
 *  see Vendor.phoneOtpPinId. */
export async function sendPhoneOtp(phoneE164: string): Promise<SendOtpResult> {
  const config = getConfig();
  if (!config) {
    console.error("[sms:infobip] not configured — cannot send OTP");
    return { ok: false, code: "CONFIG_MISSING", error: SMS_NOT_CONFIGURED_MESSAGE };
  }

  const to = toInfobipMsisdn(phoneE164);
  try {
    const res = await fetch(`${config.baseUrl}/2fa/2/pin`, {
      method: "POST",
      headers: {
        Authorization: `App ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        applicationId: config.applicationId,
        messageId: config.messageId,
        to,
      }),
    });

    if (!res.ok) {
      const failure = await mapInfobipFailure("send", res);
      return { ok: false, ...failure };
    }

    const data = (await res.json()) as { pinId?: string };
    if (!data.pinId) {
      console.error("[sms:infobip] send response missing pinId");
      return { ok: false, code: "PROVIDER_FAILURE", error: "We couldn't send the verification code right now. Please try again." };
    }
    return { ok: true, pinId: data.pinId };
  } catch (err) {
    console.error("[sms:infobip] network error on send", { message: err instanceof Error ? err.message : String(err) });
    return { ok: false, code: "PROVIDER_FAILURE", error: "We couldn't send the verification code right now. Please try again." };
  }
}

export type CheckOtpResult = { ok: true; approved: boolean } | { ok: false; error: string };

/** Checks a code against Infobip's own record for the given `pinId` — the
 *  one returned by a prior sendPhoneOtp() call for this vendor. Infobip caps
 *  wrong-code attempts per pinId itself; we don't track attempt counts. */
export async function checkPhoneOtp(pinId: string, code: string): Promise<CheckOtpResult> {
  const config = getConfig();
  if (!config) return { ok: false, error: SMS_NOT_CONFIGURED_MESSAGE };

  try {
    const res = await fetch(`${config.baseUrl}/2fa/2/pin/${encodeURIComponent(pinId)}/verify`, {
      method: "POST",
      headers: {
        Authorization: `App ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ pin: code }),
    });

    if (!res.ok) {
      const failure = await mapInfobipFailure("verify", res);
      return { ok: false, error: failure.error };
    }

    const data = (await res.json()) as { verified?: boolean };
    return { ok: true, approved: data.verified === true };
  } catch (err) {
    console.error("[sms:infobip] network error on verify", { message: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: "We couldn't check your code right now. Please try again shortly." };
  }
}
