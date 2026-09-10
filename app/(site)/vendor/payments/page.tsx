import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVendorParticipation } from "@/lib/vendorStats";
import { VendorNav } from "@/components/vendor/VendorNav";
import { PaymentsClient } from "./PaymentsClient";

export const metadata: Metadata = { title: "Payments — My Dashboard" };

// Moved out of the dashboard's old top tab row into its own route, reachable
// from the left sidebar — logic unchanged from the former Payments tab:
// every successful payment (past or upcoming), from lib/vendorStats.ts.
export default async function VendorPaymentsPage() {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) redirect("/vendor/login");

  const participation = await getVendorParticipation(vendor.id);
  const payments = [...participation.upcoming, ...participation.history]
    .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0))
    .map((h) => ({
      paymentId: h.paymentId,
      applicationId: h.applicationId,
      eventName: h.eventName,
      boothCode: h.boothCode,
      boothSize: h.boothSize,
      amountAedFils: h.amountAedFils,
      paidAt: h.paidAt ? h.paidAt.toISOString() : null,
    }));

  return (
    <div className="container-page py-12">
      <div className="flex flex-col md:flex-row gap-8">
        <VendorNav businessName={vendor.businessName} />
        <div className="flex-1 min-w-0">
          <PaymentsClient payments={payments} />
        </div>
      </div>
    </div>
  );
}
