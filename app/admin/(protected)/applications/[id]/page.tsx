import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { runExpiryPass } from "@/lib/expiry";
import { getDisplayStatus } from "@/lib/status";
import { getOfflinePaymentQuote } from "@/lib/offlinePayment";
import { onlinePaymentMode } from "@/lib/paymentMode";
import { paymentMethodLabel } from "@/lib/paymentLabels";
import { lifecycleStatus } from "@/lib/paymentLifecycle";
import { getGateway } from "@/payments/gateway";
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
      payments: {
        orderBy: { createdAt: "desc" },
        include: { refunds: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "asc" } } },
      },
      cancellationRequests: { orderBy: { createdAt: "desc" } },
      assignedBooths: true,
      heldBooths: true,
    },
  });

  const succeeded = app.payments.some((p) => p.status === "SUCCEEDED");
  // Only worth computing while there's something to pay for.
  const offlineQuote = app.status === "ACCEPTED" && !succeeded ? await getOfflinePaymentQuote(app.id) : null;

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
        vendorDescription: app.vendor.description,
        vendorVerified: app.vendor.verified,
        status: app.status,
        displayStatus: getDisplayStatus(app, succeeded),
        acceptedAt: app.acceptedAt ? app.acceptedAt.toISOString() : null,
        acceptanceExpiresAt: app.acceptanceExpiresAt ? app.acceptanceExpiresAt.toISOString() : null,
        acceptanceHoursUsed: app.acceptanceHoursUsed,
        rejectedAt: app.rejectedAt ? app.rejectedAt.toISOString() : null,
        expiredAt: app.expiredAt ? app.expiredAt.toISOString() : null,
        eventName: app.event.name,
        eventId: app.event.id,
        heldBooths: app.heldBooths.filter((b) => b.status === "HELD").map((b) => b.code),
        soldBooths: app.assignedBooths
          .filter((b) => b.status === "SOLD")
          .map((b) => ({ code: b.code, priceAedFilsAtSale: b.priceAedFilsAtSale })),
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
          methodLabel: paymentMethodLabel(p),
          reference: p.providerRef,
          note: p.note,
          receiptNumber: p.receiptNumber,
          lifecycle: lifecycleStatus(p),
          refundedAedFils: p.refundedAedFils,
          needsAttention: p.needsAttention,
          providerRefundable: p.provider === getGateway().name && !!getGateway().refund,
          refunds: p.refunds.map((r) => ({
            id: r.id,
            amountAedFils: r.amountAedFils,
            method: r.method,
            reason: r.reason,
            reference: r.reference,
            createdAt: r.createdAt.toISOString(),
          })),
          events: p.events.map((e) => ({ id: e.id, type: e.type, actor: e.actor, createdAt: e.createdAt.toISOString() })),
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
      offlineQuote={offlineQuote}
      onlinePaymentMode={onlinePaymentMode()}
    />
  );
}
