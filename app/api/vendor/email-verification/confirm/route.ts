import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken, isExpired } from "@/lib/tokens";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// Opened from an email link — deliberately no session requirement, since
// the vendor may open it in a different browser/tab than the one they're
// signed in on. The high-entropy token itself (see lib/tokens.ts) is the
// authorization; this route never trusts anything else client-supplied.
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`email-verify-confirm:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "This verification link is invalid.", code: "INVALID" }, { status: 400 });

  const tokenRow = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!tokenRow) {
    return NextResponse.json({ error: "This verification link is invalid or has expired.", code: "INVALID" }, { status: 400 });
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: tokenRow.vendorId } });
  if (!vendor || vendor.accountStatus !== "ACTIVE") {
    return NextResponse.json({ error: "This verification link is invalid or has expired.", code: "INVALID" }, { status: 400 });
  }

  if (tokenRow.usedAt) {
    // Already verified via this (or a later) link — a friendly distinct
    // message, not the same "invalid" error as a bad/guessed token.
    if (vendor.emailVerifiedAt) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }
    return NextResponse.json({ error: "This verification link has expired.", code: "EXPIRED" }, { status: 400 });
  }

  if (isExpired(tokenRow.expiresAt)) {
    return NextResponse.json({ error: "This verification link has expired.", code: "EXPIRED" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.vendor.update({ where: { id: vendor.id }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailVerificationToken.update({ where: { id: tokenRow.id }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true, alreadyVerified: false });
}
