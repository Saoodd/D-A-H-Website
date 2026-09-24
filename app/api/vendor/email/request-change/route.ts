import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getVendorSession, verifyPassword } from "@/lib/auth";
import { emailChangeRequestSchema } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { generateRawToken, hashToken } from "@/lib/tokens";
import { sendEmailChangeVerifyEmail } from "@/lib/email";
import { trustedSiteUrl } from "@/lib/url";

const EMAIL_CHANGE_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Step 1 of changing the account email: re-authenticate with the current
// password, then send a verification link to the NEW address. The login
// email itself never changes here — only /api/vendor/email/confirm, once
// that link is opened, actually updates it.
export async function POST(req: NextRequest) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = clientIp(req.headers);
  if (!rateLimit(`email-change:${session.vendorId}`, 5, 15 * 60 * 1000) || !rateLimit(`email-change-ip:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = emailChangeRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await verifyPassword(parsed.data.password, vendor.passwordHash))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const newEmail = parsed.data.newEmail.toLowerCase();
  if (newEmail === vendor.email) {
    return NextResponse.json({ error: "That's already your current email address." }, { status: 400 });
  }

  const existing = await prisma.vendor.findUnique({ where: { email: newEmail } });
  if (existing) {
    return NextResponse.json({ error: "That email address is already in use by another account." }, { status: 409 });
  }

  await prisma.emailChangeToken.updateMany({
    where: { vendorId: vendor.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const raw = generateRawToken();
  try {
    await prisma.emailChangeToken.create({
      data: {
        vendorId: vendor.id,
        newEmail,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MS),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Please try again." }, { status: 409 });
    }
    throw err;
  }

  await sendEmailChangeVerifyEmail({
    vendorId: vendor.id,
    newEmail,
    businessName: vendor.businessName,
    verifyUrl: `${trustedSiteUrl()}/vendor/profile/confirm-email?token=${raw}`,
  });

  return NextResponse.json({ ok: true });
}
