import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { emailChangeConfirmSchema } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { hashToken, isExpired } from "@/lib/tokens";
import { sendEmailChangedNotice } from "@/lib/email";

const INVALID_TOKEN_ERROR = "This confirmation link is invalid or has expired. Please request the email change again.";

// The token itself (emailed only to the new address, after the account
// owner re-authenticated to request it) is the authorization — no session
// is required to open this link, since it's opened from a different inbox.
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`email-confirm:${ip}`, 15, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = emailChangeConfirmSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 });

  const tokenRow = await prisma.emailChangeToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) } });
  if (!tokenRow || tokenRow.usedAt || isExpired(tokenRow.expiresAt)) {
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 });
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: tokenRow.vendorId } });
  if (!vendor || vendor.accountStatus !== "ACTIVE") {
    return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 });
  }

  const oldEmail = vendor.email;

  try {
    await prisma.$transaction([
      // Opening this link (which was only ever sent to the NEW address) is
      // itself proof of control over it — the new email is both switched to
      // and marked verified in the same step, so a vendor never has to
      // separately re-verify an address they just proved they own.
      prisma.vendor.update({
        where: { id: vendor.id },
        data: { email: tokenRow.newEmail, emailChangedAt: new Date(), emailVerifiedAt: new Date() },
      }),
      prisma.emailChangeToken.update({ where: { id: tokenRow.id }, data: { usedAt: new Date() } }),
    ]);
  } catch (err) {
    // Another account claimed this email in the window between the request
    // and this confirmation — the unique index is the real guarantee.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That email address is already in use by another account." }, { status: 409 });
    }
    throw err;
  }

  await sendEmailChangedNotice({ vendorId: vendor.id, oldEmail, businessName: vendor.businessName, newEmail: tokenRow.newEmail });

  return NextResponse.json({ ok: true, newEmail: tokenRow.newEmail });
}
