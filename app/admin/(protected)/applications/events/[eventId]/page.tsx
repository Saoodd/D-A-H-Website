import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { runExpiryPass } from "@/lib/expiry";
import { getDisplayStatus } from "@/lib/status";
import { PageHeader } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { EventApplicationsClient } from "./EventApplicationsClient";

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { name: true } });
  return { title: event ? `${event.name} Applications — Admin` : "Applications — Admin" };
}

export default async function AdminEventApplicationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) notFound();

  await runExpiryPass(eventId);

  const applications = await prisma.application.findMany({
    where: { eventId },
    include: {
      vendor: { select: { id: true, logoUrl: true, verified: true } },
      payments: { where: { status: "SUCCEEDED" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const vendorIds = Array.from(new Set(applications.map((a) => a.vendorId)));

  const [warningRows, priorPayments] = await Promise.all([
    prisma.vendorWarning.findMany({
      where: { status: "ACTIVE", vendorId: { in: vendorIds } },
      select: { vendorId: true },
    }),
    prisma.payment.findMany({
      where: { status: "SUCCEEDED", application: { vendorId: { in: vendorIds } } },
      select: { application: { select: { vendorId: true, eventId: true } } },
    }),
  ]);

  const hasActiveWarning = new Set(warningRows.map((w) => w.vendorId));

  // Previous DAH participation: distinct OTHER events this vendor has a
  // successful payment for — never a stored counter.
  const priorEventsByVendor = new Map<string, Set<string>>();
  for (const p of priorPayments) {
    if (p.application.eventId === eventId) continue;
    const set = priorEventsByVendor.get(p.application.vendorId) ?? new Set<string>();
    set.add(p.application.eventId);
    priorEventsByVendor.set(p.application.vendorId, set);
  }

  const rows = applications.map((a) => ({
    id: a.id,
    vendorId: a.vendorId,
    businessName: a.businessName,
    logoUrl: a.vendor.logoUrl,
    category: a.category,
    contactName: a.contactName,
    email: a.email,
    phone: a.phone,
    createdAt: a.createdAt.toISOString(),
    displayStatus: getDisplayStatus(a, a.payments.length > 0),
    previousParticipation: priorEventsByVendor.get(a.vendorId)?.size ?? 0,
    hasActiveWarning: hasActiveWarning.has(a.vendorId),
  }));

  return (
    <div>
      <Link href="/admin/applications" className="text-xs text-brown-light hover:text-brown-dark underline underline-offset-2 mb-4 inline-block">
        ← All Events
      </Link>
      <PageHeader
        eyebrow="Applications"
        title={event.name}
        description={`${event.startDate.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}${event.location ? ` · ${event.location}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/admin/communications/new?eventId=${event.id}&audience=pending`} variant="secondary" size="sm">
              Message Pending
            </LinkButton>
            <LinkButton href={`/admin/communications/new?eventId=${event.id}&audience=accepted-unpaid`} variant="secondary" size="sm">
              Message Accepted
            </LinkButton>
            <LinkButton href={`/admin/communications/new?eventId=${event.id}&audience=rejected`} variant="secondary" size="sm">
              Message Rejected
            </LinkButton>
          </div>
        }
      />
      <EventApplicationsClient eventName={event.name} applications={rows} />
    </div>
  );
}
