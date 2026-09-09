import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getAcceptanceDeadlineHours } from "@/lib/settings";
import { sendApplicationApprovedEmail } from "@/lib/email";

// Bulk acceptance is the same acceptance logic as the single Approve
// button, applied to several applications at once — not a separate
// admin-side process. Deliberately narrower than the single-application
// route though: only PENDING applications are eligible here. An
// already-accepted, paid, rejected or expired application selected in a
// batch is skipped and reported, never silently re-accepted, duplicated,
// or reset — re-accepting an individual rejected/expired application stays
// a single-application action (see [id]/approve), which the admin does
// deliberately, one at a time.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const applicationIds: unknown = body.applicationIds;
  if (!Array.isArray(applicationIds) || applicationIds.length === 0 || !applicationIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "applicationIds must be a non-empty array of strings" }, { status: 400 });
  }
  // Keep batches bounded — this is an admin convenience action, not a bulk
  // data-migration tool.
  if (applicationIds.length > 200) {
    return NextResponse.json({ error: "Too many applications selected at once (max 200)." }, { status: 400 });
  }

  const results: { applicationId: string; ok: boolean; businessName?: string; reason?: string }[] = [];

  // Each application is accepted independently and atomically — one
  // vendor's ineligibility (already accepted/paid/rejected/expired, or
  // deleted between selection and submit) never blocks or corrupts the
  // others, and a race with a concurrent single-Approve click can't double
  // up: the write only lands if the row's status still matches what this
  // request read moments before.
  for (const applicationId of applicationIds) {
    const application = await prisma.application.findUnique({ where: { id: applicationId }, include: { event: true } });
    if (!application) {
      results.push({ applicationId, ok: false, reason: "not_found" });
      continue;
    }
    if (application.status !== "PENDING") {
      results.push({
        applicationId,
        ok: false,
        businessName: application.businessName,
        reason: `already_${application.status.toLowerCase()}`,
      });
      continue;
    }

    const hours = await getAcceptanceDeadlineHours(application.event.acceptanceDeadlineHours);
    const acceptedAt = new Date();
    const acceptanceExpiresAt = new Date(acceptedAt.getTime() + hours * 60 * 60 * 1000);

    // Guard the write with the exact status this request read — if
    // something else changed it in between (another admin, an expiry
    // sweep), this update matches zero rows instead of clobbering it.
    const claim = await prisma.application.updateMany({
      where: { id: applicationId, status: "PENDING" },
      data: {
        status: "ACCEPTED",
        acceptedAt,
        acceptanceExpiresAt,
        acceptanceHoursUsed: hours,
        rejectedAt: null,
        expiredAt: null,
      },
    });

    if (claim.count === 0) {
      results.push({ applicationId, ok: false, businessName: application.businessName, reason: "race_lost" });
      continue;
    }

    await sendApplicationApprovedEmail({
      vendorEmail: application.email,
      businessName: application.businessName,
      eventName: application.event.name,
      deadlineHours: hours,
    });

    results.push({ applicationId, ok: true, businessName: application.businessName });
  }

  const accepted = results.filter((r) => r.ok);
  const skipped = results.filter((r) => !r.ok);

  return NextResponse.json({
    ok: true,
    acceptedCount: accepted.length,
    skippedCount: skipped.length,
    results,
  });
}
