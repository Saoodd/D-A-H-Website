import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runExpiryPass } from "@/lib/expiry";
import { notifyVendorWhatsApp } from "@/lib/notifications/notify";
import { applicationUrl } from "@/lib/notifications/links";
import { purgeExpiredRateLimits } from "@/lib/rateLimit";

// The one periodic sweep for every reminder-shaped WhatsApp use case —
// there is no other scheduled-job infrastructure in this codebase (no
// vercel.json crons, no queue), so this route (wired via vercel.json's
// `crons` entry, hourly) is the safest option for Vercel's serverless
// model: no long-lived process, idempotent per run via the same
// dedupeKey mechanism every other WhatsApp send uses, and cheap enough to
// run hourly without a real job queue.
//
// Auth: Vercel Cron calls this with `Authorization: Bearer ${CRON_SECRET}`
// automatically when CRON_SECRET is set on the project — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
// Without CRON_SECRET configured, this route refuses every request rather
// than running unauthenticated — a periodic vendor-messaging endpoint
// must never be triggerable by an arbitrary public GET.

const REMINDER_WINDOW_HOURS = 6; // "expiring soon" — fire once inside this window before a deadline, not on every run before it

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runAcceptanceAndBoothSelectionReminders(now: Date) {
  const threshold = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);
  const apps = await prisma.application.findMany({
    where: {
      status: "ACCEPTED",
      acceptanceExpiresAt: { gt: now, lt: threshold },
      payments: { none: { status: "SUCCEEDED" } }, // never a Confirmed & Paid booking — same guard as lib/expiry.ts
    },
    include: { event: true, heldBooths: true, assignedBooths: true },
  });

  for (const app of apps) {
    const hasStartedBoothSelection = app.heldBooths.length > 0 || app.assignedBooths.length > 0;
    const useCase = hasStartedBoothSelection ? "ACCEPTANCE_REMINDER" : "BOOTH_SELECTION_REMINDER";
    await notifyVendorWhatsApp({
      useCase,
      vendorId: app.vendorId,
      eventId: app.eventId,
      applicationId: app.id,
      entityId: `${app.id}:${app.acceptanceExpiresAt!.getTime()}`,
      data: {
        business_name: app.businessName,
        event_name: app.event.name,
        acceptance_deadline: app.acceptanceExpiresAt!.toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" }),
        booking_url: applicationUrl(app.id),
      },
    });
  }
}

async function runPaymentReminders(now: Date) {
  const holdingBooths = await prisma.booth.findMany({
    where: { status: "HELD", holdStage: "PAYMENT", holdExpiresAt: { gt: now } },
    include: { heldByApplication: { include: { event: true } } },
  });

  for (const booth of holdingBooths) {
    const app = booth.heldByApplication;
    if (!app) continue;
    await notifyVendorWhatsApp({
      useCase: "PAYMENT_REMINDER",
      vendorId: app.vendorId,
      eventId: app.eventId,
      applicationId: app.id,
      entityId: `${app.id}:${booth.holdExpiresAt!.getTime()}`,
      data: {
        business_name: app.businessName,
        event_name: app.event.name,
        booth: booth.code,
        booking_url: applicationUrl(app.id),
      },
    });
  }
}

async function runEventReminders(now: Date, windowDays: number) {
  const from = now;
  const to = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({ where: { status: "PUBLISHED", startDate: { gt: from, lt: to } } });

  for (const event of events) {
    // Eligible = confirmed & paid — never rejected, expired, or an
    // application with no successful payment. A vendor who applied but
    // never completed their booking has nothing to be "reminded" about.
    const paidApplications = await prisma.application.findMany({
      where: { eventId: event.id, payments: { some: { status: "SUCCEEDED" } } },
    });
    for (const app of paidApplications) {
      await notifyVendorWhatsApp({
        useCase: "EVENT_REMINDER",
        vendorId: app.vendorId,
        eventId: event.id,
        applicationId: app.id,
        entityId: `${event.id}:${app.id}`,
        data: {
          business_name: app.businessName,
          event_name: event.name,
          event_date: event.startDate.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" }),
          venue: event.location,
          booking_url: applicationUrl(app.id),
        },
      });
    }
  }
}

async function runVendorSetupReminders(now: Date, windowDays: number) {
  // No dedicated "setup date/time" field exists on Event — DAH's setup
  // schedule isn't modeled separately from the event's own start date.
  // Using "the day before startDate" as a documented convention rather
  // than fabricating a precise time this app doesn't actually know;
  // setup_time is deliberately left blank (never a guessed clock time —
  // an admin can map it to a literal in the Template Registry if a fixed
  // setup time applies to every event).
  const from = now;
  const to = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({ where: { status: "PUBLISHED", startDate: { gt: from, lt: to } } });

  for (const event of events) {
    const paidApplications = await prisma.application.findMany({
      where: { eventId: event.id, payments: { some: { status: "SUCCEEDED" } } },
      include: { assignedBooths: true },
    });
    const setupDate = new Date(event.startDate.getTime() - 24 * 60 * 60 * 1000);
    for (const app of paidApplications) {
      const boothCodes = app.assignedBooths.map((b) => b.code).join(", ");
      await notifyVendorWhatsApp({
        useCase: "VENDOR_SETUP_REMINDER",
        vendorId: app.vendorId,
        eventId: event.id,
        applicationId: app.id,
        entityId: `${event.id}:${app.id}`,
        data: {
          business_name: app.businessName,
          event_name: event.name,
          setup_date: setupDate.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" }),
          setup_time: "",
          booth: boothCodes,
        },
      });
    }
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await runExpiryPass();

  const now = new Date();
  await runAcceptanceAndBoothSelectionReminders(now);
  await runPaymentReminders(now);
  await runEventReminders(now, 3);
  await runVendorSetupReminders(now, 2);

  // Housekeeping piggybacking on the only scheduled job: rate-limit buckets
  // are keyed by IP/email, so without this the table only ever grows.
  const purgedRateLimits = await purgeExpiredRateLimits();

  return NextResponse.json({ ok: true, ranAt: now.toISOString(), purgedRateLimits });
}
