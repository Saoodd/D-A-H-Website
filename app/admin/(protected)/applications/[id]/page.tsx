import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { runExpiryPass } from "@/lib/expiry";
import { getDisplayStatus } from "@/lib/status";
import { ApplicationDetailAdminClient } from "./ApplicationDetailAdminClient";

export default async function AdminApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const existing = await prisma.application.findUnique({ where: { id } });
  if (!existing) notFound();

  await runExpiryPass(existing.eventId);

  const app = await prisma.application.findUniqueOrThrow({
    where: { id },
    include: {
      event: true,
      vendor: true,
      adjustments: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      cancellationRequests: { orderBy: { createdAt: "desc" } },
      assignedBooths: true,
      heldBooths: true,
    },
  });

  const succeeded = app.payments.some((p) => p.status === "SUCCEEDED");

  return (
    <ApplicationDetailAdminClient
      application={{
        id: app.id,
        businessName: app.businessName,
        contactName: app.contactName,
        email: app.email,
        phone: app.phone,
        category: app.category,
        instagram: app.instagram,
        message: app.message,
        status: app.status,
        displayStatus: getDisplayStatus(app, succeeded),
        acceptedAt: app.acceptedAt ? app.acceptedAt.toISOString() : null,
        acceptanceExpiresAt: app.acceptanceExpiresAt ? app.acceptanceExpiresAt.toISOString() : null,
        acceptanceHoursUsed: app.acceptanceHoursUsed,
        rejectedAt: app.rejectedAt ? app.rejectedAt.toISOString() : null,
        expiredAt: app.expiredAt ? app.expiredAt.toISOString() : null,
        eventName: app.event.name,
        eventId: app.event.id,
        heldBooth: app.heldBooths.find((b) => b.status === "HELD")?.code || null,
        soldBooth: app.assignedBooths.find((b) => b.status === "SOLD") || null,
        adjustments: app.adjustments.map((a) => ({
          id: a.id,
          amountAedFils: a.amountAedFils,
          reason: a.reason,
          createdAt: a.createdAt.toISOString(),
        })),
        payments: app.payments.map((p) => ({
          id: p.id,
          amountAedFils: p.amountAedFils,
          status: p.status,
          provider: p.provider,
          createdAt: p.createdAt.toISOString(),
          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        })),
        cancellationRequests: app.cancellationRequests.map((c) => ({
          id: c.id,
          reason: c.reason,
          status: c.status,
          createdAt: c.createdAt.toISOString(),
        })),
      }}
    />
  );
}
