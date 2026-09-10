import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession, destroyVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { isValidHttpUrl } from "@/lib/url";
import { runExpiryPass } from "@/lib/expiry";
import { getDisplayStatus } from "@/lib/status";
import { getVendorParticipation } from "@/lib/vendorStats";
import { getMinPriceForEvent } from "@/lib/events";
import { DashboardClient } from "./DashboardClient";
import { PendingVerificationClient } from "./PendingVerificationClient";

export const metadata: Metadata = { title: "My Dashboard" };

export default async function VendorDashboardPage() {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) redirect("/vendor/login");
  if (vendor.accountStatus !== "ACTIVE") {
    await destroyVendorSession();
    redirect("/vendor/login");
  }

  // Unverified vendors can't apply to events yet, but they're still a
  // registered account: they can see/edit their profile and the main DAH
  // community is open to every registered vendor, not just verified ones.
  if (!vendor.verified) {
    const settings = await getSettings();
    return (
      <PendingVerificationClient
        businessName={vendor.businessName}
        communityLink={isValidHttpUrl(settings.mainCommunityWhatsappLink) ? settings.mainCommunityWhatsappLink : null}
      />
    );
  }

  const applications = await prisma.application.findMany({
    where: { vendorId: vendor.id },
    select: { eventId: true },
  });

  for (const app of applications) {
    await runExpiryPass(app.eventId);
  }

  const [refreshed, settings, publishedEvents, participation, warnings] = await Promise.all([
    prisma.application.findMany({
      where: { vendorId: vendor.id },
      include: { event: true, payments: { where: { status: "SUCCEEDED" } } },
      orderBy: { createdAt: "desc" },
    }),
    getSettings(),
    prisma.event.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { startDate: "asc" },
    }),
    getVendorParticipation(vendor.id),
    prisma.vendorWarning.findMany({
      where: { vendorId: vendor.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, viewedAt: true, createdAt: true },
    }),
  ]);

  const appliedByEventId = new Map(refreshed.map((a) => [a.eventId, a]));
  const now = new Date();
  const upcomingPublished = publishedEvents.filter((e) => e.startDate >= now);

  // Every confirmed/paid upcoming event — the vendor's real bookings — gets
  // its own featured card above the discovery grid, soonest event first.
  const confirmedEvents = [...participation.upcoming]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((p) => ({
      applicationId: p.applicationId,
      eventId: p.eventId,
      eventName: p.eventName,
      eventSlug: p.eventSlug,
      coverImage: p.coverImage,
      startDate: p.startDate.toISOString(),
      endDate: p.endDate ? p.endDate.toISOString() : null,
      location: p.location,
      boothCode: p.boothCode,
      boothSize: p.boothSize,
      amountAedFils: p.amountAedFils,
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      whatsappVendorGroupLink: p.whatsappVendorGroupLink,
    }));
  const confirmedEventIds = new Set(confirmedEvents.map((e) => e.eventId));

  // One row per upcoming published event the vendor hasn't already booked
  // into — a confirmed/paid event lives in the featured section above and
  // must never also appear in this discovery grid. Starting price is only
  // computed when the event actually shows public pricing, to avoid a
  // wasted booth query otherwise.
  const upcomingEvents = await Promise.all(
    upcomingPublished
      .filter((e) => !confirmedEventIds.has(e.id))
      .map(async (e) => {
        const application = appliedByEventId.get(e.id);
        return {
          id: e.id,
          slug: e.slug,
          name: e.name,
          location: e.location,
          coverImage: e.coverImage,
          startDate: e.startDate.toISOString(),
          endDate: e.endDate ? e.endDate.toISOString() : null,
          minPriceAedFils: e.showPublicPricing ? await getMinPriceForEvent(e.id) : null,
          applicationId: application?.id ?? null,
          displayStatus: application ? getDisplayStatus(application, application.payments.length > 0) : null,
        };
      })
  );

  const allApplications = refreshed.map((a) => ({
    id: a.id,
    eventName: a.event.name,
    eventStartDate: a.event.startDate.toISOString(),
    displayStatus: getDisplayStatus(a, a.payments.length > 0),
    acceptanceExpiresAt: a.acceptanceExpiresAt ? a.acceptanceExpiresAt.toISOString() : null,
  }));

  // A confirmed/paid application already owns the featured Confirmed Events
  // section above — repeating it here would show the same event twice on
  // Overview with two different visual treatments, so this preview only
  // ever surfaces applications still in progress (pending/accepted/
  // rejected/expired). The full history at /vendor/applications is
  // unfiltered and still includes paid ones, for a complete audit trail.
  const recentApplications = allApplications.filter((a) => a.displayStatus !== "PAID").slice(0, 4);

  return (
    <DashboardClient
      businessName={vendor.businessName}
      communityLink={isValidHttpUrl(settings.mainCommunityWhatsappLink) ? settings.mainCommunityWhatsappLink : null}
      confirmedEvents={confirmedEvents}
      upcomingEvents={upcomingEvents}
      recentApplications={recentApplications}
      totalApplicationsCount={allApplications.length}
      unviewedWarnings={warnings
        .filter((w) => !w.viewedAt)
        .map((w) => ({ id: w.id, title: w.title }))}
    />
  );
}
