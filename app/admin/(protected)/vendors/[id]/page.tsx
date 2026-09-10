import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDisplayStatus } from "@/lib/status";
import { getVendorParticipation } from "@/lib/vendorStats";
import { isEmailVerified, isPhoneVerified } from "@/lib/verification";
import { VendorDetailClient } from "./VendorDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id }, select: { businessName: true } });
  return { title: vendor ? `${vendor.businessName} — Admin` : "Vendor — Admin" };
}

export default async function AdminVendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) notFound();

  const [applications, participation, notes, warnings, agreements] = await Promise.all([
    prisma.application.findMany({
      where: { vendorId: id },
      include: {
        event: { select: { id: true, name: true, slug: true, startDate: true } },
        heldBooths: true,
        assignedBooths: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
    getVendorParticipation(id),
    prisma.vendorNote.findMany({ where: { vendorId: id }, orderBy: { createdAt: "desc" } }),
    prisma.vendorWarning.findMany({
      where: { vendorId: id },
      orderBy: { createdAt: "desc" },
      include: { event: { select: { name: true } } },
    }),
    prisma.agreementAcceptance.findMany({ where: { vendorId: id }, orderBy: { acceptedAt: "desc" } }),
  ]);

  return (
    <VendorDetailClient
      vendor={{
        id: vendor.id,
        businessName: vendor.businessName,
        contactName: vendor.contactName,
        email: vendor.email,
        phone: vendor.phone,
        category: vendor.category,
        description: vendor.description,
        instagram: vendor.instagram,
        website: vendor.website,
        logoUrl: vendor.logoUrl,
        verified: vendor.verified,
        createdAt: vendor.createdAt.toISOString(),
        tradeLicenseNumber: vendor.tradeLicenseNumber,
        tradeLicenseFileUrl: vendor.tradeLicenseFileUrl,
        tradeLicenseExpiry: vendor.tradeLicenseExpiry ? vendor.tradeLicenseExpiry.toISOString().slice(0, 10) : null,
        emailVerified: isEmailVerified(vendor),
        emailVerifiedAt: vendor.emailVerifiedAt ? vendor.emailVerifiedAt.toISOString() : null,
        phoneVerified: isPhoneVerified(vendor),
        phoneVerifiedAt: vendor.phoneVerifiedAt ? vendor.phoneVerifiedAt.toISOString() : null,
      }}
      stats={{
        eventsParticipated: participation.eventsParticipated,
        upcomingConfirmedCount: participation.upcomingConfirmedCount,
        applicationsCount: applications.length,
        totalPaidAedFils: participation.history.reduce((sum, h) => sum + h.amountAedFils, 0) + participation.upcoming.reduce((sum, u) => sum + u.amountAedFils, 0),
      }}
      applications={applications.map((a) => {
        const succeeded = a.payments[0]?.status === "SUCCEEDED";
        const heldBooth = a.heldBooths.find((b) => b.status === "HELD") || null;
        const soldBooth = a.assignedBooths.find((b) => b.status === "SOLD") || null;
        return {
          id: a.id,
          eventName: a.event.name,
          eventStartDate: a.event.startDate.toISOString(),
          status: a.status,
          displayStatus: getDisplayStatus(a, succeeded),
          boothCode: soldBooth?.code || heldBooth?.code || null,
          paymentId: succeeded ? a.payments[0].id : null,
        };
      })}
      notes={notes.map((n) => ({ id: n.id, note: n.note, createdAt: n.createdAt.toISOString() }))}
      warnings={warnings.map((w) => ({
        id: w.id,
        title: w.title,
        description: w.description,
        severity: w.severity,
        status: w.status,
        adminNote: w.adminNote,
        eventName: w.event?.name ?? null,
        viewedAt: w.viewedAt ? w.viewedAt.toISOString() : null,
        acknowledgedAt: w.acknowledgedAt ? w.acknowledgedAt.toISOString() : null,
        createdAt: w.createdAt.toISOString(),
      }))}
      events={applications.map((a) => ({ id: a.event.id, name: a.event.name }))}
      agreements={agreements.map((a) => ({
        id: a.id,
        title: a.snapshotTitle,
        type: a.snapshotType,
        eventName: a.snapshotEventName,
        version: a.snapshotVersion,
        acceptedAt: a.acceptedAt.toISOString(),
      }))}
    />
  );
}
