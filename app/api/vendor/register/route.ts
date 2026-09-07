import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { vendorRegisterSchema } from "@/lib/validation";
import { hashPassword, createVendorSession } from "@/lib/auth";
import { sendAccountCreatedEmails } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// Creates a DAH business account — not tied to any event. The vendor can
// log in immediately, but their dashboard shows nothing until DAH verifies
// the business (Admin → Vendors). Applying to specific events happens
// afterwards, from inside the dashboard (see /api/vendor/apply-event).
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`vendor-register:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  if (!json) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = vendorRegisterSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const data = parsed.data;

  // Honeypot tripped — pretend success so bots don't learn anything.
  if (data.website && data.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const email = data.email.toLowerCase();
  const existing = await prisma.vendor.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account already exists for this email. Please log in instead." },
      { status: 409 }
    );
  }

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
      verified: false,
    },
  });

  await createVendorSession(vendor.id);

  await sendAccountCreatedEmails({ vendorEmail: email, businessName: data.businessName });

  return NextResponse.json({ ok: true, vendorId: vendor.id });
}
