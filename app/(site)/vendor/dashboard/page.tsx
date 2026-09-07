import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { runExpiryPass } from "@/lib/expiry";
import { getDisplayStatus } from "@/lib/status";
import { DashboardClient } from "./DashboardClient";

export const metadata: Metadata = { title: "My Dashboard" };

export default async function VendorDashboardPage() {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) redirect("/vendor/login");

  const applications = await prisma.application.findMany({
    where: { vendorId: vendor.id },
    include: { event: true },
    orderBy: { createdAt: "desc" },
  });

  for (const app of applications) {
    await runExpiryPass(app.eventId);
  }

  const refreshed = await prisma.application.findMany({
    where: { vendorId: vendor.id },
    include: { event: true, payments: { where: { status: "SUCCEEDED" } } },
    orderBy: { createdAt: "desc" },
  });

  const settings = await getSettings();

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
    />
  );
}
