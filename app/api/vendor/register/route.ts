import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { vendorRegisterSchema } from "@/lib/validation";
import { hashPassword, createVendorSession, getVendorSession } from "@/lib/auth";
import { sendAccountCreatedEmails } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { getSettings } from "@/lib/settings";
import { ensureVendorTermsExist, getPublishedAgreement, recordAcceptance } from "@/lib/agreements";

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

  const email = data.email.toLowerCase();
  const existing = await prisma.vendor.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account already exists for this email. Please log in instead." },
      { status: 409 }
    );
  }

  await ensureVendorTermsExist();
  const publishedTerms = await getPublishedAgreement("VENDOR_TERMS", null);

  const vendor = await prisma.vendor.create({
    data: {
      email,
      passwordHash: await hashPassword(data.password),
      businessName: data.businessName,
      contactName: data.contactName,
      phone: data.phone,
      category: data.category,
      description: data.description || "",
      instagram: data.instagram || null,
      logoUrl: data.logoUrl || null,
      tradeLicenseFileUrl: data.tradeLicenseFileUrl || null,
      verified: false,
    },
  });

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

  await sendAccountCreatedEmails({ vendorEmail: email, businessName: data.businessName });

  return NextResponse.json({ ok: true, vendorId: vendor.id });
}
