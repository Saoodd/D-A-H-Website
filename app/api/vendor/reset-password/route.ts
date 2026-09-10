import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { hashToken, isExpired } from "@/lib/tokens";
import { hashPassword, invalidateAllVendorSessions } from "@/lib/auth";

const INVALID_TOKEN_ERROR = "This reset link is invalid or has expired. Please request a new one.";

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`reset-password:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues.find((i) => i.path[0] === "password")?.message;
    return NextResponse.json({ error: message || "Please check the form and try again." }, { status: 400 });
  }

  const tokenRow = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) } });
  if (!tokenRow || tokenRow.usedAt || isExpired(tokenRow.expiresAt)) {
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 });
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: tokenRow.vendorId } });
  if (!vendor || vendor.accountStatus !== "ACTIVE") {
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.$transaction([
    prisma.vendor.update({ where: { id: vendor.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: tokenRow.id }, data: { usedAt: new Date() } }),
  ]);

  // A password reset is often prompted by suspected compromise — every
  // session issued before this point (including one an attacker may already
  // hold) stops working immediately, not just whenever it would naturally
  // expire.
  await invalidateAllVendorSessions(vendor.id);

  return NextResponse.json({ ok: true });
}
