import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/Card";
import { AgreementEditor } from "@/components/admin/AgreementEditor";
import { AgreementRecordsTable } from "@/components/admin/AgreementRecordsTable";
import { getEventVendorAgreementStatus } from "@/lib/agreements";
import { VendorAgreementStatusTable } from "./VendorAgreementStatusTable";

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { name: true } });
  return { title: event ? `${event.name} Terms — Admin` : "Event Terms — Admin" };
}

export default async function AdminEventTermsWorkspacePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, startDate: true, location: true } });
  if (!event) notFound();

  const vendorRows = await getEventVendorAgreementStatus(eventId);

  return (
    <div className="max-w-5xl">
      <Link href="/admin/agreements/events" className="text-xs text-brown-light hover:text-brown-dark underline underline-offset-2 mb-4 inline-block">
        ← All Event Terms
      </Link>
      <PageHeader
        eyebrow="Event Terms"
        title={event.name}
        description={`${new Date(event.startDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}${event.location ? ` · ${event.location}` : ""} — this event's Terms & Conditions are entirely separate from Signup Terms and from every other event.`}
      />

      <div className="max-w-3xl">
        <AgreementEditor type="EVENT_TERMS" eventId={event.id} scopeLabel={`${event.name}'s Terms & Conditions`} />
      </div>

      <div className="mt-14">
        <p className="label-caps mb-4">Vendor Agreement Status</p>
        <VendorAgreementStatusTable
          rows={vendorRows.map((r) => ({
            applicationId: r.applicationId,
            businessName: r.businessName,
            contactName: r.contactName,
            username: r.username,
            boothCode: r.boothCode,
            displayStatus: r.displayStatus,
            agreementAccepted: r.agreementAccepted,
            acceptedVersion: r.acceptedVersion,
            acceptedBy: r.acceptedBy,
            acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
            acceptanceRecordId: r.acceptanceRecordId,
          }))}
        />
      </div>

      <div className="mt-14">
        <p className="label-caps mb-4">{event.name} Agreement Export</p>
        <AgreementRecordsTable lockType="EVENT_TERMS" eventId={event.id} />
      </div>
    </div>
  );
}
