import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { normalizePhoneToE164 } from "@/lib/phone";
import { checkWhatsAppOtp } from "@/lib/whatsapp/otp";
import { isPhoneVerified } from "@/lib/verification";

// Checks a code the vendor typed against the hash stored on their own row
// (set by a prior /phone-verification/send call — see
// Vendor.phoneOtpCodeHash/phoneOtpExpiresAt/phoneOtpAttempts and
// lib/whatsapp/otp.ts). Wrong-code attempts are capped in
// checkWhatsAppOtp itself now — WhatsApp template sends have no hosted
// PIN-verification API the way Infobip's SMS 2FA API did, so DAH caps
// this itself; the rate limits here are an extra layer, same dual
// (account + IP) pattern used everywhere else in the app.
export async function POST(req: NextRequest) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const ip = clientIp(req.headers);
  if (!rateLimit(`phone-verify-check:${session.vendorId}`, 10, 15 * 60 * 1000) || !rateLimit(`phone-verify-check-ip:${ip}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Please request a new code." }, { status: 429 });
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor || vendor.accountStatus !== "ACTIVE") return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (isPhoneVerified(vendor)) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const normalizedPhone = normalizePhoneToE164(vendor.phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: "Please update your mobile number in Profile before verifying it." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ error: "Please enter the code we sent you." }, { status: 400 });

  // The in-flight OTP lives only on the vendor's own row (set by a prior
  // send call under this same session) — a vendor can never reach
  // another vendor's in-flight attempt, and phoneOtpPhone must still
  // match their CURRENT number in case they changed it after sending but
  // before verifying.
  if (!vendor.phoneOtpCodeHash || vendor.phoneOtpPhone !== normalizedPhone) {
    return NextResponse.json({ error: "Please request a new code." }, { status: 400 });
  }

  const result = await checkWhatsAppOtp(vendor.id, code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (!result.approved) return NextResponse.json({ error: "That code isn't correct. Please try again." }, { status: 400 });

  // Snapshot the exact number this verification matched — see
  // lib/verification.ts isPhoneVerified for why this, rather than a bare
  // boolean, is what makes a later phone change fall back to unverified
  // automatically.
  const now = new Date();
  await prisma.$transaction([
    prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        phoneVerifiedAt: now,
        phoneVerifiedNumber: normalizedPhone,
        phoneVerifiedMethod: "WHATSAPP",
        phoneOtpCodeHash: null,
        phoneOtpPhone: null,
        phoneOtpExpiresAt: null,
        phoneOtpAttempts: 0,
      },
    }),
    prisma.vendorPhoneVerificationLog.create({
      data: { vendorId: vendor.id, phone: normalizedPhone, method: "WHATSAPP" },
    }),
  ]);

  return NextResponse.json({ ok: true, alreadyVerified: false });
}
