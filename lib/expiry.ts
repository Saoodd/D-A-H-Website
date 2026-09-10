import "server-only";
import { prisma } from "./prisma";
import { sendAcceptanceExpiredEmail } from "./email";

// Server/DB-enforced expiry. Called at the top of any API route that reads
// or writes booths/applications, so a booth or an acceptance can never be
// acted on past its deadline even if a client ignores its countdown.

/** Release any booth whose system-driven hold (review or payment stage) has
 *  expired, scoped to one event if given. */
export async function releaseExpiredHolds(eventId?: string) {
  const now = new Date();
  await prisma.booth.updateMany({
    where: {
      status: "HELD",
      holdExpiresAt: { lt: now },
      ...(eventId ? { eventId } : {}),
    },
    data: {
      status: "AVAILABLE",
      holdStage: null,
      holdExpiresAt: null,
      heldByApplicationId: null,
    },
  });
}

/** Expire any ACCEPTED application whose payment deadline has passed:
 *  flips status, releases any booth it was holding, and emails the vendor.
 *  Idempotent — only fires once per application since status changes away
 *  from ACCEPTED after the first pass. */
export async function expireStaleAcceptances(eventId?: string) {
  const now = new Date();
  const stale = await prisma.application.findMany({
    where: {
      status: "ACCEPTED",
      acceptanceExpiresAt: { lt: now },
      ...(eventId ? { eventId } : {}),
    },
    include: { event: true, vendor: true },
  });

  for (const app of stale) {
    await prisma.$transaction([
      prisma.application.update({
        where: { id: app.id },
        data: { status: "ACCEPTANCE_EXPIRED", expiredAt: now },
      }),
      prisma.booth.updateMany({
        where: { heldByApplicationId: app.id, status: { in: ["HELD"] } },
        data: {
          status: "AVAILABLE",
          holdStage: null,
          holdExpiresAt: null,
          heldByApplicationId: null,
        },
      }),
    ]);

    await sendAcceptanceExpiredEmail({
      vendorId: app.vendorId,
      vendorEmail: app.vendor.email,
      businessName: app.businessName,
      eventId: app.eventId,
      eventName: app.event.name,
      dedupeKey: `application_expired:${app.id}:${now.getTime()}`,
    });
  }
}

/** Run both expiry passes. Call this before any read/write that depends on
 *  current booth or acceptance state. */
export async function runExpiryPass(eventId?: string) {
  await expireStaleAcceptances(eventId);
  await releaseExpiredHolds(eventId);
}
