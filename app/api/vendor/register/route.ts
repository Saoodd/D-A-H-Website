import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { vendorRegisterSchema } from "@/lib/validation";
import { hashPassword, createVendorSession, getVendorSession } from "@/lib/auth";
import { sendAccountCreatedEmails, sendVerifyEmailEmail } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { getSettings } from "@/lib/settings";
import { normalizeUsername } from "@/lib/username";
import { normalizePhoneToE164 } from "@/lib/phone";
import { generateRawToken, hashToken } from "@/lib/tokens";
import { trustedSiteUrl } from "@/lib/url";
import { ensureVendorTermsExist, getPublishedAgreement, recordAcceptance } from "@/lib/agreements";

const EMAIL_VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Creates a DAH business account — not tied to any event. The vendor can
// log in immediately, but their dashboard shows nothing until DAH verifies
// the business (Admin → Vendors). Applying to specific events happens
// afterwards, from inside the dashboard (see /api/vendor/apply-event).
export async function POST(req: NextRequest) {
  // A signed-in vendor must never end up with a second account — this is
  // enforced here regardless of what the signup UI shows/hides.
  const session = await getVendorSession();
  if (session) {
    return NextResponse.json(
      { error: "You're already signed in with a DAH business account. Sign out to create a different business account." },
      { status: 409 }
    );
  }

  const ip = clientIp(req.headers);
  if (!rateLimit(`vendor-register:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  if (!json) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = vendorRegisterSchema.safeParse(json);
  if (!parsed.success) {
    // The terms checkbox is real, server-side validation — not just a UI
    // affordance. A request without agreedToTerms:true never gets here.
    const termsIssue = parsed.error.issues.find((i) => i.path[0] === "agreedToTerms");
    if (termsIssue) {
      return NextResponse.json({ error: termsIssue.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const data = parsed.data;

  // Honeypot tripped — pretend success so bots don't learn anything.
  if (data.website && data.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const settings = await getSettings();
  if (settings.tradeLicenseRequired && !data.tradeLicenseFileUrl) {
    return NextResponse.json({ error: "A trade licence document is required." }, { status: 400 });
  }

  // A proven parsing library, not a handwritten regex — rejects anything
  // that isn't actually a dialable number up front, since an unparseable
  // number could never receive an SMS verification code later anyway.
  const normalizedPhone = normalizePhoneToE164(data.phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: "Please enter a valid mobile number, including country code." }, { status: 400 });
  }

  const email = data.email.toLowerCase();
  const existing = await prisma.vendor.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account already exists for this email. Please log in instead." },
      { status: 409 }
    );
  }

  // Friendly pre-check — the real, race-safe guarantee is the unique
  // index on usernameLower caught below, since two people could submit
  // the same username within the same instant.
  const usernameLower = normalizeUsername(data.username);
  const usernameTaken = await prisma.vendor.findUnique({ where: { usernameLower } });
  if (usernameTaken) {
    return NextResponse.json({ error: "That username is already taken. Please choose another." }, { status: 409 });
  }

  await ensureVendorTermsExist();
  const publishedTerms = await getPublishedAgreement("VENDOR_TERMS", null);

  let vendor;
  try {
    vendor = await prisma.vendor.create({
      data: {
        email,
        username: data.username,
        usernameLower,
        passwordHash: await hashPassword(data.password),
        businessName: data.businessName,
        contactName: data.contactName,
        phone: normalizedPhone,
        category: data.category,
        description: data.description || "",
        instagram: data.instagram || null,
        logoUrl: data.logoUrl || null,
        tradeLicenseFileUrl: data.tradeLicenseFileUrl || null,
        verified: false,
      },
    });
  } catch (err) {
    // Two signups for the same username landed at nearly the same instant
    // and both passed the pre-check above — the database's unique index is
    // the real guarantee, so exactly one of them ends up here.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That username is already taken. Please choose another." }, { status: 409 });
    }
    throw err;
  }

  if (publishedTerms) {
    await recordAcceptance({
      agreementId: publishedTerms.id,
      vendorId: vendor.id,
      businessName: data.businessName,
      contactName: data.contactName,
      ipAddress: ip,
      userAgent: req.headers.get("user-agent"),
    });
  }

  await createVendorSession(vendor.id);

  await sendAccountCreatedEmails({ vendorId: vendor.id, vendorEmail: email, businessName: data.businessName });

  // Kick off email verification immediately — the vendor lands on
  // /vendor/verify right after this, so the link should already be on its
  // way before they get there.
  const rawToken = generateRawToken();
  await prisma.emailVerificationToken.create({
    data: { vendorId: vendor.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + EMAIL_VERIFY_TOKEN_TTL_MS) },
  });
  await sendVerifyEmailEmail({
    vendorId: vendor.id,
    vendorEmail: email,
    businessName: data.businessName,
    verifyUrl: `${trustedSiteUrl()}/vendor/verify/email?token=${rawToken}`,
  });

  return NextResponse.json({ ok: true, vendorId: vendor.id });
}
