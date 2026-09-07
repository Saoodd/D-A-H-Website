import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applicationSchema } from "@/lib/validation";
import { hashPassword, verifyPassword, createVendorSession } from "@/lib/auth";
import { sendApplicationReceivedEmails } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`applications:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  if (!json) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = applicationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const data = parsed.data;

  // Honeypot tripped — pretend success so bots don't learn anything.
  if (data.website && data.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const event = await prisma.event.findUnique({ where: { id: data.eventId } });
  if (!event || event.status !== "PUBLISHED") {
    return NextResponse.json({ error: "This event is not accepting applications." }, { status: 400 });
  }

  const email = data.email.toLowerCase();
  let vendor = await prisma.vendor.findUnique({ where: { email } });

  if (vendor) {
    const passwordOk = await verifyPassword(data.password, vendor.passwordHash);
    if (!passwordOk) {
      return NextResponse.json(
        { error: "An account already exists for this email. Please use your existing password to apply again." },
        { status: 401 }
      );
    }
  } else {
    vendor = await prisma.vendor.create({
      data: {
        email,
        passwordHash: await hashPassword(data.password),
        businessName: data.businessName,
        contactName: data.contactName,
        phone: data.phone,
        instagram: data.instagram || null,
      },
    });
  }

  const existingApplication = await prisma.application.findFirst({
    where: { vendorId: vendor.id, eventId: event.id },
  });
  if (existingApplication) {
    return NextResponse.json(
      { error: "You've already applied for this event — check your dashboard for its status." },
      { status: 409 }
    );
  }

  const application = await prisma.application.create({
    data: {
      vendorId: vendor.id,
      eventId: event.id,
      businessName: data.businessName,
      contactName: data.contactName,
      phone: data.phone,
      email,
      category: data.category,
      instagram: data.instagram || null,
      message: data.message || "",
      status: "PENDING",
    },
  });

  await createVendorSession(vendor.id);

  await sendApplicationReceivedEmails({
    vendorEmail: email,
    businessName: data.businessName,
    eventName: event.name,
  });

  return NextResponse.json({ ok: true, applicationId: application.id });
}
