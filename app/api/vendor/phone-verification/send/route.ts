import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { rateLimit, peekCooldown, armCooldown, clientIp } from "@/lib/rateLimit";
import { normalizePhoneToE164, maskPhoneForDisplay } from "@/lib/phone";
import { sendPhoneOtp } from "@/lib/sms/infobip";
import { isPhoneVerified } from "@/lib/verification";

const RESEND_COOLDOWN_MS = 45 * 1000;

// Sends an SMS OTP to the SESSION vendor's current phone number, via
// Infobip 2FA — never accepts a phone number from the request body, so
// this can only ever target your own account's own current number
// (PART 12: "unauthorized verification requests").
//
// The resend cooldown is only ARMED after Infobip actually accepts the send
// (see armCooldown() below) — never at the top of the request. Arming it
// unconditionally (the old behavior) meant a failed send — bad number,
// provider outage, our own rate limit — left the vendor locked out of
// retrying for the full cooldown window even though no code was ever sent,
// with the frontend showing a resend countdown and no OTP box: exactly the
// "SMS silently fails but the UI acts like it worked" bug.
export async function POST(req: NextRequest) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor || vendor.accountStatus !== "ACTIVE") return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (isPhoneVerified(vendor)) {
    return NextResponse.json({ error: "Your mobile number is already verified.", code: "ALREADY_VERIFIED" }, { status: 409 });
  }

  // The one authoritative normalizer (lib/phone.ts) — same function used at
  // signup, profile edit, and the staleness check in lib/verification.ts.
  // It already strips a UAE local trunk "0" correctly (0561234800 ->
  // +971561234800); this was verified directly and is not the bug.
  const normalizedPhone = normalizePhoneToE164(vendor.phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: "Please update your mobile number in Profile before verifying it.", code: "PHONE_INVALID" },
      { status: 400 }
    );
  }

  const cooldownKey = `phone-verify-cooldown:${vendor.id}`;
  const cd = peekCooldown(cooldownKey);
  if (cd.onCooldown) {
    return NextResponse.json(
      { error: "Please wait before requesting another code.", code: "RATE_LIMITED", retryAfterSeconds: cd.retryAfterSeconds },
      { status: 429 }
    );
  }

  // Three independent limits — account, the specific number, and IP — so
  // neither a compromised session nor a shared/rotated IP alone can drive
  // unlimited SMS sends to one number (PART 12: SMS pumping/bombing). These
  // count every attempt (not just successes) on purpose — an attacker
  // sending a deliberately-invalid number shouldn't dodge the abuse cap.
  const ip = clientIp(req.headers);
  if (
    !rateLimit(`phone-verify-send:${vendor.id}`, 6, 60 * 60 * 1000) ||
    !rateLimit(`phone-verify-send-num:${normalizedPhone}`, 6, 60 * 60 * 1000) ||
    !rateLimit(`phone-verify-send-ip:${ip}`, 20, 60 * 60 * 1000)
  ) {
    return NextResponse.json({ error: "Too many requests. Please try again later.", code: "RATE_LIMITED" }, { status: 429 });
  }

  const result = await sendPhoneOtp(normalizedPhone);
  if (!result.ok) {
    // result.code is one of INVALID_NUMBER / RATE_LIMITED / PROVIDER_FAILURE
    // / CONFIG_MISSING — the raw Infobip error is already logged server-side
    // inside sendPhoneOtp, never returned to the client.
    const status = result.code === "INVALID_NUMBER" ? 400 : result.code === "RATE_LIMITED" ? 429 : 503;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  // Persist the pinId this attempt must be checked against — a fresh
  // send/resend always overwrites it, invalidating whatever was active
  // before. Kept server-side only; the frontend never sees it.
  await prisma.vendor.update({
    where: { id: vendor.id },
    data: { phoneOtpPinId: result.pinId, phoneOtpPhone: normalizedPhone },
  });

  // Only now — after Infobip actually accepted the request — does the
  // vendor's resend window start counting down.
  armCooldown(cooldownKey, RESEND_COOLDOWN_MS);

  return NextResponse.json({
    ok: true,
    code: "SENT",
    cooldownSeconds: RESEND_COOLDOWN_MS / 1000,
    phoneMasked: maskPhoneForDisplay(normalizedPhone),
  });
}
