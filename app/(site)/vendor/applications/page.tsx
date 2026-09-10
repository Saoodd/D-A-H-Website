import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisplayStatus } from "@/lib/status";
import { VendorNav } from "@/components/vendor/VendorNav";
import { ApplicationsListClient } from "./ApplicationsListClient";

export const metadata: Metadata = { title: "Your Applications — My Dashboard" };

// The full application history, reachable from Overview's "View All
// Applications" button rather than a top navigation tab — same underlying
// data and statuses as the Overview snapshot, just unfiltered.
export default async function VendorApplicationsPage() {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) redirect("/vendor/login");

  const applications = await prisma.application.findMany({
    where: { vendorId: vendor.id },
    include: { event: true, payments: { where: { status: "SUCCEEDED" } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="container-page py-12">
      <div className="flex flex-col md:flex-row gap-8">
        <VendorNav businessName={vendor.businessName} />
        <div className="flex-1 min-w-0">
          <ApplicationsListClient
            applications={applications.map((a) => ({
              id: a.id,
              eventName: a.event.name,
              eventStartDate: a.event.startDate.toISOString(),
              displayStatus: getDisplayStatus(a, a.payments.length > 0),
              acceptanceExpiresAt: a.acceptanceExpiresAt ? a.acceptanceExpiresAt.toISOString() : null,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
