import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { applyToEventSchema } from "@/lib/validation";
import { sendAppliedToEventEmails } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// One-click "apply to this event" from a verified vendor's dashboard — no
// form, since their business info is already on file. Unverified vendors
// cannot apply to anything yet.
export async function POST(req: NextRequest) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const ip = clientIp(req.headers);
  if (!rateLimit(`apply-event:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = applyToEventSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!vendor.verified) {
    return NextResponse.json(
      { error: "Your business isn't verified yet — you'll be able to apply once DAH verifies your account." },
      { status: 403 }
    );
  }

  const event = await prisma.event.findUnique({ where: { id: parsed.data.eventId } });
  if (!event || event.status !== "PUBLISHED") {
    return NextResponse.json({ error: "This event is not accepting applications." }, { status: 400 });
  }

  const existing = await prisma.application.findFirst({
    where: { vendorId: vendor.id, eventId: event.id },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You've already applied for this event — check your dashboard for its status." },
      { status: 409 }
    );
  }

  const application = await prisma.application.create({
    data: {
      vendorId: vendor.id,
      eventId: event.id,
      businessName: vendor.businessName,
      contactName: vendor.contactName,
      phone: vendor.phone,
      email: vendor.email,
      category: vendor.category,
      instagram: vendor.instagram,
      status: "PENDING",
    },
  });

  await sendAppliedToEventEmails({
    vendorEmail: vendor.email,
    businessName: vendor.businessName,
    eventName: event.name,
  });

  return NextResponse.json({ ok: true, applicationId: application.id });
}
