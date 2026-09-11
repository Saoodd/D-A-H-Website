import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { rateLimit, cooldown, clientIp } from "@/lib/rateLimit";
import { normalizePhoneToE164 } from "@/lib/phone";
import { sendPhoneOtp } from "@/lib/sms/twilio";
import { isPhoneVerified } from "@/lib/verification";

const RESEND_COOLDOWN_MS = 45 * 1000;

// Sends an SMS OTP to the SESSION vendor's current phone number, via
// Twilio Verify — never accepts a phone number from the request body, so
// this can only ever target your own account's own current number
// (PART 12: "unauthorized verification requests").
export async function POST(req: NextRequest) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor || vendor.accountStatus !== "ACTIVE") return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (isPhoneVerified(vendor)) {
    return NextResponse.json({ error: "Your mobile number is already verified." }, { status: 409 });
  }

  const normalizedPhone = normalizePhoneToE164(vendor.phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: "Please update your mobile number in Profile before verifying it.", code: "PHONE_INVALID" },
      { status: 400 }
    );
  }

  const ip = clientIp(req.headers);
  const cd = cooldown(`phone-verify-cooldown:${vendor.id}`, RESEND_COOLDOWN_MS);
  if (!cd.allowed) {
    return NextResponse.json({ error: "Please wait before requesting another code.", retryAfterSeconds: cd.retryAfterSeconds }, { status: 429 });
  }
  // Three independent limits — account, the specific number, and IP — so
  // neither a compromised session nor a shared/rotated IP alone can drive
  // unlimited SMS sends to one number (PART 12: SMS pumping/bombing).
  if (
    !rateLimit(`phone-verify-send:${vendor.id}`, 6, 60 * 60 * 1000) ||
    !rateLimit(`phone-verify-send-num:${normalizedPhone}`, 6, 60 * 60 * 1000) ||
    !rateLimit(`phone-verify-send-ip:${ip}`, 20, 60 * 60 * 1000)
  ) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const result = await sendPhoneOtp(normalizedPhone);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });

  return NextResponse.json({ ok: true, cooldownSeconds: RESEND_COOLDOWN_MS / 1000, phoneMasked: normalizedPhone.replace(/\d(?=\d{4})/g, "*") });
}
