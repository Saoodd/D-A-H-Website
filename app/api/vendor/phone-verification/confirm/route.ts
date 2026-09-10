import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { normalizePhoneToE164 } from "@/lib/phone";
import { checkPhoneOtp } from "@/lib/sms/twilio";
import { isPhoneVerified } from "@/lib/verification";

// Checks a code the vendor typed against Twilio Verify's own record for
// their CURRENT phone number. Twilio itself caps wrong-code attempts per
// verification (error 60202) — the rate limits here are an extra layer,
// same dual (account + IP) pattern used everywhere else in the app.
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

  const result = await checkPhoneOtp(normalizedPhone, code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  if (!result.approved) return NextResponse.json({ error: "That code isn't correct. Please try again." }, { status: 400 });

  // Snapshot the exact number this verification matched — see
  // lib/verification.ts isPhoneVerified for why this, rather than a bare
  // boolean, is what makes a later phone change fall back to unverified
  // automatically.
  await prisma.vendor.update({ where: { id: vendor.id }, data: { phoneVerifiedAt: new Date(), phoneVerifiedNumber: normalizedPhone } });

  return NextResponse.json({ ok: true, alreadyVerified: false });
}
