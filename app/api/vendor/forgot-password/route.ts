import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { generateRawToken, hashToken } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/email";
import { trustedSiteUrl } from "@/lib/url";

const GENERIC_MESSAGE = "If an account exists with that email, we've sent password reset instructions.";
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Deliberately always returns the same 200 + generic message, whether or
// not the email matches an account — never let a "forgot password" request
// be used to enumerate registered vendors.
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!(await rateLimit(`forgot-password:${ip}`, 5, 15 * 60 * 1000))) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const json = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: GENERIC_MESSAGE });

  const email = parsed.data.email.toLowerCase();
  // Also rate limit per-email, independent of IP, so a distributed attempt
  // against one target address is still capped.
  if (!(await rateLimit(`forgot-password-email:${email}`, 5, 15 * 60 * 1000))) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const vendor = await prisma.vendor.findUnique({ where: { email } });
  if (vendor && vendor.accountStatus === "ACTIVE") {
    // Invalidate any still-usable prior tokens so only the newest link works.
    await prisma.passwordResetToken.updateMany({
      where: { vendorId: vendor.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const raw = generateRawToken();
    await prisma.passwordResetToken.create({
      data: {
        vendorId: vendor.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    await sendPasswordResetEmail({
      vendorId: vendor.id,
      vendorEmail: vendor.email,
      businessName: vendor.businessName,
      resetUrl: `${trustedSiteUrl()}/vendor/reset-password?token=${raw}`,
    });
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
