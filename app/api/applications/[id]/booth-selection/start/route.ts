import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";
import { BOOTH_SELECTION_SESSION_MINUTES } from "@/lib/constants";
import { requirePhoneVerifiedVendor } from "@/lib/verification";

// Starts (or resumes) the 2-minute booth-selection session shown on the
// booth-selector screen. Idempotent: an already-active session is returned
// unchanged rather than reset, so a page refresh never grants extra time.
// Purely a UI-focus timer — never touches acceptanceExpiresAt, the absolute
// outer deadline.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const gate = await requirePhoneVerifiedVendor(session.vendorId);
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const application = await prisma.application.findUnique({ where: { id } });
  if (!application || application.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await runExpiryPass(application.eventId);

  const fresh = await prisma.application.findUniqueOrThrow({ where: { id } });
  if (fresh.status !== "ACCEPTED" || !fresh.acceptanceExpiresAt || fresh.acceptanceExpiresAt < new Date()) {
    return NextResponse.json({ error: "Your acceptance is not currently active." }, { status: 403 });
  }

  const now = new Date();
  if (fresh.boothSelectionExpiresAt && fresh.boothSelectionExpiresAt > now) {
    // Already have a valid session running — resume it, don't reset it.
    return NextResponse.json({ ok: true, boothSelectionExpiresAt: fresh.boothSelectionExpiresAt.toISOString() });
  }

  // Never let the selection session outlive the outer acceptance deadline.
  const proposedExpiry = new Date(now.getTime() + BOOTH_SELECTION_SESSION_MINUTES * 60 * 1000);
  const boothSelectionExpiresAt = proposedExpiry < fresh.acceptanceExpiresAt ? proposedExpiry : fresh.acceptanceExpiresAt;

  const updated = await prisma.application.update({
    where: { id },
    data: { boothSelectionExpiresAt },
  });

  return NextResponse.json({ ok: true, boothSelectionExpiresAt: updated.boothSelectionExpiresAt!.toISOString() });
}
