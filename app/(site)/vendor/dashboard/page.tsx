import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { runExpiryPass } from "@/lib/expiry";
import { getDisplayStatus } from "@/lib/status";
import { getVendorParticipation } from "@/lib/vendorStats";
import { DashboardClient } from "./DashboardClient";
import { PendingVerificationClient } from "./PendingVerificationClient";

export const metadata: Metadata = { title: "My Dashboard" };

export default async function VendorDashboardPage() {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) redirect("/vendor/login");

  // Unverified vendors can't apply to events yet, but they're still a
  // registered account: they can see/edit their profile and the main DAH
  // community is open to every registered vendor, not just verified ones.
  if (!vendor.verified) {
    const settings = await getSettings();
    return <PendingVerificationClient businessName={vendor.businessName} communityLink={settings.mainCommunityWhatsappLink} />;
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

  const appliedEventIds = new Set(refreshed.map((a) => a.eventId));

  return (
    <DashboardClient
      businessName={vendor.businessName}
      communityLink={settings.mainCommunityWhatsappLink}
      applications={refreshed.map((a) => ({
        id: a.id,
        eventName: a.event.name,
        eventStartDate: a.event.startDate.toISOString(),
        displayStatus: getDisplayStatus(a, a.payments.length > 0),
        acceptanceExpiresAt: a.acceptanceExpiresAt ? a.acceptanceExpiresAt.toISOString() : null,
      }))}
      availableEvents={publishedEvents
        .filter((e) => !appliedEventIds.has(e.id))
        .map((e) => ({
          id: e.id,
          name: e.name,
          location: e.location,
          startDate: e.startDate.toISOString(),
          categories: e.categories,
        }))}
      nextConfirmedEvent={
        participation.upcoming.length > 0
          ? {
              eventName: participation.upcoming[0].eventName,
              eventSlug: participation.upcoming[0].eventSlug,
              startDate: participation.upcoming[0].startDate.toISOString(),
              location: participation.upcoming[0].location,
              boothCode: participation.upcoming[0].boothCode,
            }
          : null
      }
      payments={participation.history.map((h) => ({
        applicationId: h.applicationId,
        eventName: h.eventName,
        boothCode: h.boothCode,
        boothSize: h.boothSize,
        amountAedFils: h.amountAedFils,
        paidAt: h.paidAt ? h.paidAt.toISOString() : null,
      }))}
      unviewedWarnings={warnings
        .filter((w) => !w.viewedAt)
        .map((w) => ({ id: w.id, title: w.title }))}
    />
  );
}
