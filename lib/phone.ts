import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js";

// DAH is Dubai-based, so a number typed without an explicit country code
// (e.g. "0501234567" or "50 123 4567") is assumed UAE — matches the
// PhoneField default country selector on signup/profile.
const DEFAULT_REGION = "AE";

/** Parses a phone number in any of the shapes the UI accepts ("0501234567",
 *  "+971501234567", "971 50 123 4567", "+971 50 123 4567" from PhoneField's
 *  "<code> <number>" combined value) into canonical E.164 ("+971501234567").
 *  Returns null for anything that doesn't parse as a valid, real number —
 *  never a fragile handwritten regex, always the same library both here and
 *  wherever a phone number needs comparing. */
export function normalizePhoneToE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_REGION);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // already E.164, e.g. "+971501234567"
}

/** Masks all but the country code and last 4 digits — "+971 50 *** 1234" —
 *  for display on the Verify Your Account / Profile pages, so the full
 *  number is never shown back in a way that invites shoulder-surfing.
 *
 *  Uses `nationalNumber` (the raw significant digits, e.g. "561234800"),
 *  never `formatNational()` — the latter deliberately re-adds the UAE
 *  domestic trunk prefix "0" for local-dialing display ("056 123 4800"),
 *  which reads as a bogus extra zero right after "+971" here and is NOT
 *  part of the actual E.164 number that gets stored or sent to Twilio. */
export function maskPhoneForDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  const national = parsed.nationalNumber;
  if (national.length <= 4) return `+${parsed.countryCallingCode} ${national}`;
  const last4 = national.slice(-4);
  const visiblePrefix = national.slice(0, Math.max(0, national.length - 4 - 3));
  const stars = "*".repeat(Math.max(0, national.length - visiblePrefix.length - 4));
  return `+${parsed.countryCallingCode} ${visiblePrefix} ${stars} ${last4}`.replace(/\s+/g, " ").trim();
}
