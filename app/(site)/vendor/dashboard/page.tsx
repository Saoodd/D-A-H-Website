import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { runExpiryPass } from "@/lib/expiry";
import { getDisplayStatus } from "@/lib/status";
import { DashboardClient } from "./DashboardClient";
import { PendingVerificationClient } from "./PendingVerificationClient";

export const metadata: Metadata = { title: "My Dashboard" };

export default async function VendorDashboardPage() {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) redirect("/vendor/login");

  // Unverified vendors see nothing but a "pending verification" notice —
  // no community link, no events, no applications — until DAH verifies
  // their business (Admin → Vendors).
  if (!vendor.verified) {
    return <PendingVerificationClient businessName={vendor.businessName} />;
  }

  const applications = await prisma.application.findMany({
    where: { vendorId: vendor.id },
    select: { eventId: true },
  });

  for (const app of applications) {
    await runExpiryPass(app.eventId);
  }

  const [refreshed, settings, publishedEvents] = await Promise.all([
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
    />
  );
}
