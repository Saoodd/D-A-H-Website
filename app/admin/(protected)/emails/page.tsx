import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/Card";
import { EmailsAdminClient } from "./EmailsAdminClient";

export const metadata: Metadata = { title: "Emails — Admin" };

const RETRYABLE_TYPES = ["application_accepted", "application_rejected", "application_expired", "payment_receipt", "warning"];

export default async function AdminEmailsPage() {
  const deliveries = await prisma.emailDelivery.findMany({
    orderBy: { queuedAt: "desc" },
    take: 150,
    include: { vendor: { select: { businessName: true } } },
  });

  return (
    <div className="max-w-5xl">
      <PageHeader title="Emails" description="Transactional email delivery log — most recent 150 sends." />
      <EmailsAdminClient
        deliveries={deliveries.map((d) => ({
          id: d.id,
          type: d.type,
          toEmail: d.toEmail,
          vendorBusinessName: d.vendor?.businessName ?? null,
          status: d.status,
          failReason: d.failReason,
          queuedAt: d.queuedAt.toISOString(),
          sentAt: d.sentAt ? d.sentAt.toISOString() : null,
          deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
          retryable: d.status === "FAILED" && !!d.dedupeKey && RETRYABLE_TYPES.includes(d.dedupeKey.split(":")[0]),
        }))}
      />
    </div>
  );
}
