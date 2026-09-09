import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { toCsv } from "@/lib/csv";
import { toXlsxBuffer } from "@/lib/xlsx";

// Cross-cutting search over every signed agreement record — Vendor Account
// Agreements and Event Agreements together — filterable by business,
// contact, event, agreement type/version and accepted date range, with an
// optional CSV or Excel export of the same filtered set. `eventId` scopes
// this to one event's Event Terms records only — used by the per-event
// Agreements workspace's export, so it never includes any other event or
// Signup Terms records.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const type = searchParams.get("type");
  const version = searchParams.get("version");
  const eventId = searchParams.get("eventId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const format = searchParams.get("format");

  const where: Record<string, unknown> = {};
  if (type === "VENDOR_TERMS" || type === "EVENT_TERMS") where.snapshotType = type;
  if (version) {
    const v = Number(version);
    if (Number.isFinite(v)) where.snapshotVersion = v;
  }
  if (eventId) where.application = { eventId };
  if (dateFrom || dateTo) {
    where.acceptedAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
  }
  if (q) {
    where.OR = [
      { snapshotBusinessName: { contains: q, mode: "insensitive" } },
      { snapshotContactName: { contains: q, mode: "insensitive" } },
      { snapshotEventName: { contains: q, mode: "insensitive" } },
      { representativeName: { contains: q, mode: "insensitive" } },
      { vendor: { username: { contains: q, mode: "insensitive" } } },
    ];
  }

  const acceptances = await prisma.agreementAcceptance.findMany({
    where,
    orderBy: { acceptedAt: "desc" },
    take: 1000,
  });

  const applicationIds = acceptances.map((a) => a.applicationId).filter((id): id is string => !!id);
  const vendorIds = Array.from(new Set(acceptances.map((a) => a.vendorId)));
  const [soldBooths, payments, vendors] = await Promise.all([
    applicationIds.length
      ? prisma.booth.findMany({ where: { assignedApplicationId: { in: applicationIds }, status: "SOLD" }, select: { code: true, assignedApplicationId: true } })
      : Promise.resolve([]),
    applicationIds.length
      ? prisma.payment.findMany({ where: { applicationId: { in: applicationIds }, status: "SUCCEEDED" }, select: { id: true, applicationId: true } })
      : Promise.resolve([]),
    prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, username: true } }),
  ]);
  const boothByApp = new Map(soldBooths.map((b) => [b.assignedApplicationId, b.code]));
  const paymentByApp = new Map(payments.map((p) => [p.applicationId, p.id]));
  const usernameByVendor = new Map(vendors.map((v) => [v.id, v.username]));

  const rows = acceptances.map((a) => ({
    id: a.id,
    businessName: a.snapshotBusinessName,
    contactName: a.snapshotContactName,
    username: usernameByVendor.get(a.vendorId) ?? "",
    representativeName: a.representativeName,
    title: a.snapshotTitle,
    type: a.snapshotType,
    eventName: a.snapshotEventName,
    version: a.snapshotVersion,
    acceptedAt: a.acceptedAt.toISOString(),
    boothCode: a.applicationId ? boothByApp.get(a.applicationId) ?? null : null,
    applicationId: a.applicationId,
    bookingId: a.applicationId ? paymentByApp.get(a.applicationId) ?? null : null,
    vendorId: a.vendorId,
  }));

  const exportRows = rows.map((r) => ({
    business: r.businessName,
    contact: r.contactName,
    username: r.username,
    authorizedRepresentative: r.representativeName ?? "",
    agreement: r.title,
    agreementType: r.type === "VENDOR_TERMS" ? "Account" : "Event",
    event: r.eventName ?? "",
    version: r.version,
    acceptedAt: r.acceptedAt,
    booth: r.boothCode ?? "",
    applicationId: r.applicationId ?? "",
    bookingId: r.bookingId ?? "",
  }));

  const filenameBase = eventId ? "dah-event-agreements" : "dah-agreements";

  if (format === "csv") {
    const csv = toCsv(exportRows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filenameBase}-${Date.now()}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const buffer = await toXlsxBuffer(exportRows, "Agreements");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}-${Date.now()}.xlsx"`,
      },
    });
  }

  return NextResponse.json({ rows });
}
