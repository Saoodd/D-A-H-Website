import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDisplayStatus } from "@/lib/status";
import { getPublishedAgreement } from "@/lib/agreements";
import { getEventRevenueAedFils } from "@/lib/payments";
import { formatBoothCodes } from "@/lib/constants";
import { EventWorkspaceClient } from "./EventWorkspaceClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, select: { name: true } });
  return { title: event ? `${event.name} — Admin` : "Edit Event — Admin" };
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, include: { booths: true } });
  if (!event) notFound();

  const [existingEvents, tiers, applications, payments, revenue] = await Promise.all([
    prisma.event.findMany({ where: { id: { not: id } }, select: { id: true, name: true } }),
    prisma.pricingTier.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.application.findMany({
      where: { eventId: id },
      include: { vendor: { select: { id: true, businessName: true, verified: true } }, payments: { where: { status: "SUCCEEDED" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.findMany({
      where: { eventId: id, status: "SUCCEEDED" },
      include: { application: { select: { businessName: true, id: true } }, booths: { select: { booth: { select: { code: true } } } } },
      orderBy: { paidAt: "desc" },
    }),
    // Same authoritative sum used by the Payments area — never a
    // booth-price-snapshot heuristic, which can diverge after a manual
    // adjustment or a walk-in booth assigned without a payment record.
    getEventRevenueAedFils(id),
  ]);

  const sold = event.booths.filter((b) => b.status === "SOLD");

  const uniqueVendors = Array.from(
    new Map(applications.map((a) => [a.vendor.id, { id: a.vendor.id, businessName: a.vendor.businessName, verified: a.vendor.verified }])).values()
  );

  // Terms Status: for every application that reached acceptance (i.e. is
  // actually required to go through Event Terms), has it accepted the
  // CURRENTLY published version? Only meaningful once the event has a
  // published Event Terms agreement at all.
  const acceptedApplications = applications.filter((a) => a.status === "ACCEPTED");
  const publishedEventTerms = await getPublishedAgreement("EVENT_TERMS", id);
  let acceptedTermsApplicationIds = new Set<string>();
  if (publishedEventTerms && acceptedApplications.length > 0) {
    const accs = await prisma.agreementAcceptance.findMany({
      where: { agreementId: publishedEventTerms.id, applicationId: { in: acceptedApplications.map((a) => a.id) } },
      select: { applicationId: true },
    });
    acceptedTermsApplicationIds = new Set(accs.map((a) => a.applicationId as string));
  }

  return (
    <EventWorkspaceClient
      event={{
        id: event.id,
        name: event.name,
        status: event.status,
      }}
      stats={{
        applicationsCount: applications.length,
        pending: applications.filter((a) => a.status === "PENDING").length,
        accepted: applications.filter((a) => a.status === "ACCEPTED").length,
        rejected: applications.filter((a) => a.status === "REJECTED").length,
        boothsSold: sold.length,
        boothsTotal: event.booths.length,
        revenue,
        vendorsCount: uniqueVendors.length,
      }}
      applications={applications.map((a) => ({
        id: a.id,
        businessName: a.businessName,
        vendorId: a.vendor.id,
        displayStatus: getDisplayStatus(a, a.payments.length > 0),
        createdAt: a.createdAt.toISOString(),
      }))}
      vendors={uniqueVendors}
      payments={payments.map((p) => ({
        id: p.id,
        businessName: p.application.businessName,
        applicationId: p.application.id,
        boothCode: formatBoothCodes(p.booths.map((pb) => pb.booth.code)),
        amountAedFils: p.amountAedFils,
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      }))}
      eventFormProps={{
        existingEvents,
        initial: {
          id: event.id,
          name: event.name,
          slug: event.slug,
          description: event.description,
          startDate: event.startDate.toISOString(),
          endDate: event.endDate ? event.endDate.toISOString() : null,
          location: event.location,
          coverImage: event.coverImage,
          categories: event.categories,
          floorPlanImageUrl: event.floorPlanImageUrl,
          venueWidthM: event.venueWidthM,
          showPublicPricing: event.showPublicPricing,
          status: event.status,
          whatsappVendorGroupLink: event.whatsappVendorGroupLink,
          acceptanceDeadlineHours: event.acceptanceDeadlineHours,
          allowMultipleBooths: event.allowMultipleBooths,
        },
      }}
      floorPlanProps={{
        eventId: event.id,
        floorPlanImageUrl: event.floorPlanImageUrl,
        venueWidthM: event.venueWidthM,
        tiers: tiers.map((t) => ({ sizeKey: t.sizeKey, label: t.label, priceAedFils: t.priceAedFils })),
      }}
      termsStatus={{
        hasPublishedTerms: !!publishedEventTerms,
        rows: acceptedApplications.map((a) => ({
          applicationId: a.id,
          businessName: a.businessName,
          displayStatus: getDisplayStatus(a, a.payments.length > 0),
          acceptedTerms: acceptedTermsApplicationIds.has(a.id),
        })),
      }}
    />
  );
}
