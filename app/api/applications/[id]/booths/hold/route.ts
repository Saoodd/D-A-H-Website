import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { runExpiryPass } from "@/lib/expiry";
import { requirePhoneVerifiedVendor } from "@/lib/verification";
import { getAllowMultipleBooths } from "@/lib/settings";
import { MAX_BOOTHS_PER_BOOKING } from "@/lib/constants";
import { checkBoothFit } from "@/lib/boothFit";

// Atomically holds 1 or 2 booths for one application's booking — the
// single entry point booth confirmation now goes through, replacing direct
// calls to /api/booths/[boothId]/hold (still present, untouched, for
// anything else that might reference it) with one request that claims the
// whole requested set together. Either every requested booth becomes HELD
// by this application, or none do — no partial-booking state.
//
// Every request re-supplies the FULL desired set of booth ids (not an
// incremental "add one more"): this reconciles cleanly with whatever the
// application currently holds, releasing anything not in the new set and
// claiming everything that is, all inside one transaction.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const gate = await requirePhoneVerifiedVendor(session.vendorId);
  if (!gate.ok) return gate.response;

  const { id: applicationId } = await params;
  const body = await req.json().catch(() => ({}));
  const boothIds = Array.isArray(body.boothIds) ? (body.boothIds.filter((x: unknown) => typeof x === "string") as string[]) : null;
  if (!boothIds || boothIds.length === 0) {
    return NextResponse.json({ error: "boothIds required" }, { status: 400 });
  }
  const uniqueBoothIds = Array.from(new Set(boothIds));
  if (uniqueBoothIds.length > MAX_BOOTHS_PER_BOOKING) {
    return NextResponse.json({ error: `You can select at most ${MAX_BOOTHS_PER_BOOKING} booths.` }, { status: 400 });
  }

  const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { event: true } });
  if (!application || application.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (uniqueBoothIds.length > 1) {
    const allowMultiple = await getAllowMultipleBooths(application.event.allowMultipleBooths);
    if (!allowMultiple) {
      return NextResponse.json({ error: "This event does not allow booking more than one booth." }, { status: 403 });
    }
  }

  const booths = await prisma.booth.findMany({ where: { id: { in: uniqueBoothIds } } });
  if (booths.length !== uniqueBoothIds.length || booths.some((b) => b.eventId !== application.eventId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await runExpiryPass(application.eventId);

  const freshApp = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (freshApp.status !== "ACCEPTED" || !freshApp.acceptanceExpiresAt || freshApp.acceptanceExpiresAt < new Date()) {
    return NextResponse.json({ error: "Your acceptance is not currently active." }, { status: 403 });
  }

  // Authoritative size-fit check — never trust the client. Only enforced as
  // a hard block for a SINGLE booth: with two booths selected, DAH's own
  // business rule (see lib/boothFit.ts checkMultiBoothFit) is to caution
  // rather than falsely promise or deny a combined-space fit no reliable
  // adjacency geometry can confirm.
  if (uniqueBoothIds.length === 1 && freshApp.setupWidthMm != null && freshApp.setupDepthMm != null) {
    const booth = booths[0];
    const fit = checkBoothFit({ widthMm: freshApp.setupWidthMm, depthMm: freshApp.setupDepthMm }, { widthMm: booth.widthMm, depthMm: booth.depthMm });
    if (fit.status === "DOES_NOT_FIT") {
      return NextResponse.json(
        { error: "This booth is too small for your declared setup.", code: "SIZE_MISMATCH" },
        { status: 409 }
      );
    }
  }

  const holdExpiresAt = freshApp.acceptanceExpiresAt!;

  try {
    await prisma.$transaction(async (tx) => {
      // Release anything held that isn't part of the new requested set —
      // reconciles to exactly the vendor's current selection.
      await tx.booth.updateMany({
        where: { heldByApplicationId: applicationId, status: "HELD", id: { notIn: uniqueBoothIds } },
        data: { status: "AVAILABLE", holdStage: null, holdExpiresAt: null, heldByApplicationId: null },
      });

      // Claim every requested booth with the SAME race-safe guard as the
      // single-booth hold route — re-asserting availability at write time,
      // not trusting this request's earlier read. If ANY claim doesn't land
      // (count 0), throw to roll back the whole transaction — no partial
      // hold ever gets committed.
      for (const boothId of uniqueBoothIds) {
        const claim = await tx.booth.updateMany({
          where: { id: boothId, OR: [{ status: "AVAILABLE" }, { heldByApplicationId: applicationId }] },
          data: { status: "HELD", holdStage: "REVIEW", holdExpiresAt, heldByApplicationId: applicationId },
        });
        if (claim.count === 0) {
          const failed = booths.find((b) => b.id === boothId);
          throw new BoothUnavailableError(failed?.code ?? boothId);
        }
      }
    });
  } catch (err) {
    if (err instanceof BoothUnavailableError) {
      return NextResponse.json(
        { error: `Booth ${err.boothCode} has just become unavailable. Please choose another booth.`, code: "BOOTH_UNAVAILABLE", boothCode: err.boothCode },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true, holdExpiresAt: holdExpiresAt.toISOString() });
}

class BoothUnavailableError extends Error {
  boothCode: string;
  constructor(boothCode: string) {
    super(`Booth ${boothCode} unavailable`);
    this.boothCode = boothCode;
  }
}
