import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";
import { BOOTH_REVIEW_HOLD_MINUTES } from "@/lib/constants";

// Places a 5-minute review hold on an AVAILABLE booth. Enforced server-side —
// re-checks booth/application state fresh from the DB right before writing,
// inside logic that never trusts a client-provided "it's still available".
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
  if (freshBooth.status !== "AVAILABLE" && !alreadyMine) {
    return NextResponse.json({ error: "That booth is no longer available." }, { status: 409 });
  }

  const holdExpiresAt = new Date(Date.now() + BOOTH_REVIEW_HOLD_MINUTES * 60 * 1000);

  await prisma.$transaction([
    // Release any other booth this application might already be holding —
    // a vendor can only actively hold one booth at a time.
    prisma.booth.updateMany({
      where: { heldByApplicationId: applicationId, id: { not: boothId }, status: "HELD" },
      data: { status: "AVAILABLE", holdStage: null, holdExpiresAt: null, heldByApplicationId: null },
    }),
    prisma.booth.update({
      where: { id: boothId },
      data: {
        status: "HELD",
        holdStage: "REVIEW",
        holdExpiresAt,
        heldByApplicationId: applicationId,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, holdExpiresAt: holdExpiresAt.toISOString() });
}
