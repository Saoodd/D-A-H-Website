import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { sendApplicationRejectedEmail } from "@/lib/email";
import { notifyVendorWhatsApp } from "@/lib/notifications/notify";

// Same reject logic as the single Reject button, applied to several
// applications at once. Eligible = PENDING or ACCEPTED-but-unpaid only —
// an application with a successful payment is never touched here (use the
// cancellation flow for a paid booking instead), and an already-rejected
// or expired one is simply skipped, never re-processed.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const applicationIds: unknown = body.applicationIds;
  if (!Array.isArray(applicationIds) || applicationIds.length === 0 || !applicationIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "applicationIds must be a non-empty array of strings" }, { status: 400 });
  }
  if (applicationIds.length > 200) {
    return NextResponse.json({ error: "Too many applications selected at once (max 200)." }, { status: 400 });
  }

  const results: { applicationId: string; ok: boolean; businessName?: string; reason?: string }[] = [];

  for (const applicationId of applicationIds) {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { event: true, payments: { where: { status: "SUCCEEDED" }, take: 1 } },
    });
    if (!application) {
      results.push({ applicationId, ok: false, reason: "not_found" });
      continue;
    }
    if (application.payments.length > 0) {
      results.push({ applicationId, ok: false, businessName: application.businessName, reason: "already_paid" });
      continue;
    }
    if (application.status !== "PENDING" && application.status !== "ACCEPTED") {
      results.push({
        applicationId,
        ok: false,
        businessName: application.businessName,
        reason: `already_${application.status.toLowerCase()}`,
      });
      continue;
    }

    const rejectedAt = new Date();
    const claim = await prisma.application.updateMany({
      where: { id: applicationId, status: application.status },
      data: { status: "REJECTED", rejectedAt, acceptanceExpiresAt: null },
    });
    if (claim.count === 0) {
      results.push({ applicationId, ok: false, businessName: application.businessName, reason: "race_lost" });
      continue;
    }

    await sendApplicationRejectedEmail({
      vendorId: application.vendorId,
      vendorEmail: application.email,
      businessName: application.businessName,
      eventId: application.eventId,
      eventName: application.event.name,
      dedupeKey: `application_rejected:${application.id}:${rejectedAt.getTime()}`,
    });

    await notifyVendorWhatsApp({
      useCase: "APPLICATION_REJECTED",
      vendorId: application.vendorId,
      eventId: application.eventId,
      applicationId: application.id,
      entityId: `${application.id}:${rejectedAt.getTime()}`,
      data: { business_name: application.businessName, event_name: application.event.name },
    });

    results.push({ applicationId, ok: true, businessName: application.businessName });
  }

  const rejected = results.filter((r) => r.ok);
  const skipped = results.filter((r) => !r.ok);

  return NextResponse.json({
    ok: true,
    rejectedCount: rejected.length,
    skippedCount: skipped.length,
    results,
  });
}
