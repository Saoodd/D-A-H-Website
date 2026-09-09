import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";

// Places a review hold on an AVAILABLE booth, once the vendor explicitly
// confirms it — never on click alone. Enforced server-side — re-checks
// booth/application state fresh from the DB right before writing, inside
// logic that never trusts a client-provided "it's still available".
//
// Confirming requires an active 2-minute booth-selection session (see
// /api/applications/[id]/booth-selection/start) so a stale selector tab
// can't confirm long after the vendor walked away. Once claimed, the hold
// itself is bounded by the application's outer acceptance deadline, not a
// short fixed timer — the review/terms stage isn't meant to be rushed, only
// the payment stage (tightened separately at /api/checkout/[id]/start) is.
export async function POST(req: NextRequest, { params }: { params: Promise<{ boothId: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { boothId } = await params;
  const body = await req.json().catch(() => ({}));
  const applicationId = body.applicationId as string | undefined;
  if (!applicationId) return NextResponse.json({ error: "applicationId required" }, { status: 400 });

  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application || application.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const booth = await prisma.booth.findUnique({ where: { id: boothId } });
  if (!booth || booth.eventId !== application.eventId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await runExpiryPass(application.eventId);

  const freshApp = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (freshApp.status !== "ACCEPTED" || !freshApp.acceptanceExpiresAt || freshApp.acceptanceExpiresAt < new Date()) {
    return NextResponse.json({ error: "Your acceptance is not currently active." }, { status: 403 });
  }

  const freshBooth = await prisma.booth.findUniqueOrThrow({ where: { id: boothId } });
  const alreadyMine = freshBooth.heldByApplicationId === applicationId;

  // A brand-new claim requires an active, unexpired booth-selection session
  // — re-affirming a booth this application already holds does not (that's
  // not a new selection). This is what keeps a stale/abandoned selector tab
  // from confirming long after the vendor walked away, distinct from the
  // "someone else took it" race below.
  if (!alreadyMine && (!freshApp.boothSelectionExpiresAt || freshApp.boothSelectionExpiresAt < new Date())) {
    return NextResponse.json(
      { error: "Your booth selection session has expired. Please start again.", code: "SELECTION_EXPIRED" },
      { status: 410 }
    );
  }

  if (freshBooth.status !== "AVAILABLE" && !alreadyMine) {
    return NextResponse.json({ error: "That booth is no longer available." }, { status: 409 });
  }

  // Bounded by the outer acceptance deadline, not a short fixed timer — the
  // review/terms stage isn't meant to be rushed. Only the payment stage
  // (checkout/start) tightens this to a short exclusive hold.
  const holdExpiresAt = freshApp.acceptanceExpiresAt!;

  // The read above only proves the booth LOOKED available a moment ago — if
  // two vendors click the same booth at nearly the same instant, both reads
  // can pass before either write lands. Guard the actual write with the same
  // condition (status still AVAILABLE, or already held by this application)
  // so the database — not this request's stale read — is what decides who
  // wins: only one concurrent claim can match a row whose status just
  // changed out from under it.
  const claim = await prisma.booth.updateMany({
    where: {
      id: boothId,
      OR: [{ status: "AVAILABLE" }, { heldByApplicationId: applicationId }],
    },
    data: {
      status: "HELD",
      holdStage: "REVIEW",
      holdExpiresAt,
      heldByApplicationId: applicationId,
    },
  });
  if (claim.count === 0) {
    return NextResponse.json({ error: "That booth is no longer available." }, { status: 409 });
  }

  // Release any other booth this application might already be holding — a
  // vendor can only actively hold one booth at a time.
  await prisma.booth.updateMany({
    where: { heldByApplicationId: applicationId, id: { not: boothId }, status: "HELD" },
    data: { status: "AVAILABLE", holdStage: null, holdExpiresAt: null, heldByApplicationId: null },
  });

  // The selection phase is done — clear the session so it can't linger or
  // be mistaken for still being active on a later fresh selection.
  await prisma.application.update({ where: { id: applicationId }, data: { boothSelectionExpiresAt: null } });

  return NextResponse.json({ ok: true, holdExpiresAt: holdExpiresAt.toISOString() });
}
