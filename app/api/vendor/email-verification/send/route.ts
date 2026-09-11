import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { generateRawToken, hashToken } from "@/lib/tokens";
import { sendVerifyEmailEmail } from "@/lib/email";
import { rateLimit, peekCooldown, armCooldown, clientIp } from "@/lib/rateLimit";
import { trustedSiteUrl } from "@/lib/url";
import { isEmailVerified } from "@/lib/verification";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESEND_COOLDOWN_MS = 45 * 1000;

// Sends (or resends) the email-verification link to the SESSION vendor's
// current email — never accepts an address from the request body, so this
// can only ever be used to verify your own account's own email.
export async function POST(req: NextRequest) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor || vendor.accountStatus !== "ACTIVE") return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (isEmailVerified(vendor)) {
    return NextResponse.json({ error: "Your email is already verified." }, { status: 409 });
  }

  const ip = clientIp(req.headers);
  // Cooldown gives a friendly "resend available in Ns" — the hourly caps
  // beneath it are the hard abuse ceiling (matches PART 8's "do not allow
  // spamming thousands of emails").
  const cd = peekCooldown(`email-verify-cooldown:${vendor.id}`);
  if (cd.onCooldown) {
    return NextResponse.json({ error: `Please wait before requesting another email.`, retryAfterSeconds: cd.retryAfterSeconds }, { status: 429 });
  }
  if (!rateLimit(`email-verify-send:${vendor.id}`, 6, 60 * 60 * 1000) || !rateLimit(`email-verify-send-ip:${ip}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  armCooldown(`email-verify-cooldown:${vendor.id}`, RESEND_COOLDOWN_MS);

  // Invalidate any still-usable prior tokens so only the newest link works.
  await prisma.emailVerificationToken.updateMany({ where: { vendorId: vendor.id, usedAt: null }, data: { usedAt: new Date() } });

  const raw = generateRawToken();
  await prisma.emailVerificationToken.create({
    data: { vendorId: vendor.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });

  await sendVerifyEmailEmail({
    vendorId: vendor.id,
    vendorEmail: vendor.email,
    businessName: vendor.businessName,
    verifyUrl: `${trustedSiteUrl()}/vendor/verify/email?token=${raw}`,
  });

  return NextResponse.json({ ok: true, cooldownSeconds: RESEND_COOLDOWN_MS / 1000 });
}
