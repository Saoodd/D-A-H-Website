import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { getPublishedAgreement, recordAcceptance } from "@/lib/agreements";
import { clientIp } from "@/lib/rateLimit";
import { requirePhoneVerifiedVendor } from "@/lib/verification";
import { getBoothPrice } from "@/lib/pricing";

// Read the currently published Event Terms & Conditions for this
// application's event — every event has its own independent agreement,
// never a shared global template (see /admin/events/[id] Terms tab).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id }, include: { event: true } });
  if (!application || application.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const agreement = await getPublishedAgreement("EVENT_TERMS", application.eventId);
  if (!agreement) {
    return NextResponse.json({ error: "There is no Terms & Conditions to accept for this event." }, { status: 404 });
  }

  return NextResponse.json({
    title: agreement.title,
    version: agreement.version,
    bodyHtml: agreement.bodyHtml,
    eventName: application.event.name,
  });
}

// Records this vendor's acceptance of the event's CURRENT published Terms —
// the typed representative name + authenticated session + checkbox +
// timestamp + full text snapshot is the acceptance record (no handwritten
// signature). Re-validated fully server-side: nothing here trusts the
// client beyond the representative name they typed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const gate = await requirePhoneVerifiedVendor(session.vendorId);
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const representativeName = String(body.representativeName || "").trim();
  if (!representativeName || representativeName.length < 2) {
    return NextResponse.json({ error: "Please enter the name of the authorized representative." }, { status: 400 });
  }

  const application = await prisma.application.findUnique({ where: { id }, include: { event: true } });
  if (!application || application.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (application.status !== "ACCEPTED" || !application.acceptanceExpiresAt || application.acceptanceExpiresAt < new Date()) {
    return NextResponse.json({ error: "Your acceptance is not currently active." }, { status: 403 });
  }

  const agreement = await getPublishedAgreement("EVENT_TERMS", application.eventId);
  if (!agreement) {
    return NextResponse.json({ error: "There is no Terms & Conditions to accept for this event." }, { status: 404 });
  }

  // Immutable booth snapshot: exactly which booth(s) this acceptance
  // covers, with their physical dimensions and price AT THIS MOMENT — see
  // schema comment on AgreementAcceptance.snapshotBoothsJson. Read from
  // whichever booths this application currently holds (REVIEW-stage,
  // pre-payment — this is accepted before checkout/start).
  const heldBooths = await prisma.booth.findMany({
    where: { heldByApplicationId: application.id, status: "HELD" },
  });
  const boothSnapshot = await Promise.all(
    heldBooths.map(async (b) => ({
      code: b.code,
      widthMm: b.widthMm,
      depthMm: b.depthMm,
      priceAedFils: await getBoothPrice(b, application.eventId),
    }))
  );

  const acceptance = await recordAcceptance({
    agreementId: agreement.id,
    vendorId: session.vendorId,
    applicationId: application.id,
    representativeName,
    businessName: application.businessName,
    contactName: application.contactName,
    eventName: application.event.name,
    ipAddress: clientIp(req.headers),
    userAgent: req.headers.get("user-agent"),
    booths: boothSnapshot,
  });

  return NextResponse.json({ ok: true, acceptedAt: acceptance.acceptedAt.toISOString(), representativeName: acceptance.representativeName });
}
