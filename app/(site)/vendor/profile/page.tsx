import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVendorParticipation, computeProfileCompletion } from "@/lib/vendorStats";
import { ProfileClient } from "./ProfileClient";

export const metadata: Metadata = { title: "My Profile" };

export default async function VendorProfilePage() {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) redirect("/vendor/login");

  const [participation, applicationsCount, warnings] = await Promise.all([
    getVendorParticipation(vendor.id),
    prisma.application.count({ where: { vendorId: vendor.id } }),
    prisma.vendorWarning.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        severity: true,
        status: true,
        viewedAt: true,
        acknowledgedAt: true,
        createdAt: true,
        event: { select: { name: true } },
      },
    }),
  ]);

  const completion = computeProfileCompletion(vendor as unknown as Record<string, unknown>);

  return (
    <ProfileClient
      vendor={{
        businessName: vendor.businessName,
        contactName: vendor.contactName,
        email: vendor.email,
        phone: vendor.phone,
        category: vendor.category,
        instagram: vendor.instagram,
        website: vendor.website,
        description: vendor.description,
        logoUrl: vendor.logoUrl,
        verified: vendor.verified,
        createdAt: vendor.createdAt.toISOString(),
        tradeLicenseNumber: vendor.tradeLicenseNumber,
        tradeLicenseFileUrl: vendor.tradeLicenseFileUrl,
        tradeLicenseExpiry: vendor.tradeLicenseExpiry ? vendor.tradeLicenseExpiry.toISOString().slice(0, 10) : null,
      }}
      stats={{
        eventsParticipated: participation.eventsParticipated,
        upcomingConfirmedCount: participation.upcomingConfirmedCount,
        applicationsCount,
      }}
      profileCompletion={completion}
      history={participation.history.map((h) => ({
        applicationId: h.applicationId,
        eventName: h.eventName,
        startDate: h.startDate.toISOString(),
        boothCode: h.boothCode,
        boothSize: h.boothSize,
        amountAedFils: h.amountAedFils,
      }))}
      upcoming={participation.upcoming.map((u) => ({
        applicationId: u.applicationId,
        eventName: u.eventName,
        eventSlug: u.eventSlug,
        startDate: u.startDate.toISOString(),
        boothCode: u.boothCode,
      }))}
      warnings={warnings.map((w) => ({
        id: w.id,
        title: w.title,
        description: w.description,
        severity: w.severity,
        status: w.status,
        eventName: w.event?.name ?? null,
        viewedAt: w.viewedAt ? w.viewedAt.toISOString() : null,
        acknowledgedAt: w.acknowledgedAt ? w.acknowledgedAt.toISOString() : null,
        createdAt: w.createdAt.toISOString(),
      }))}
    />
  );
}
