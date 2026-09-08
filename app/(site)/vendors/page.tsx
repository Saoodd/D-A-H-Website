import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { getVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VendorsClient } from "./VendorsClient";
import { AlreadySignedInNotice } from "@/components/vendor/AlreadySignedInNotice";

export const metadata: Metadata = {
  title: "Become a DAH Vendor",
  description: "Create your DAH business account, then apply to individual Dar Al Hay events once you're verified.",
};

export default async function VendorsPage() {
  // An authenticated vendor must never be able to create a second account —
  // this page-level check keeps the signup form from even rendering for
  // them, in addition to the server-side check in /api/vendor/register.
  const session = await getVendorSession();
  if (session) {
    const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId }, select: { businessName: true } });
    if (vendor) {
      return (
        <div className="container-page py-16 max-w-2xl">
          <AlreadySignedInNotice businessName={vendor.businessName} />
        </div>
      );
    }
  }

  const settings = await getSettings();
  return <VendorsClient tradeLicenseRequired={settings.tradeLicenseRequired} />;
}
