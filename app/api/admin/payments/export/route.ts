import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { toCsv } from "@/lib/csv";
import { toXlsxBuffer } from "@/lib/xlsx";
import { filsToAed, formatBoothCodes } from "@/lib/constants";
import { lifecycleStatus } from "@/lib/paymentLifecycle";
import { parsePaymentFilters, paymentWhere } from "@/lib/paymentFilters";

const EXPORT_CAP = 20000;

// Shared export for both the per-event Payments workspace (always passes
// `eventId`, so its file can never contain another event's transactions)
// and the All Transactions view (omits `eventId`, filters instead by
// business/status/date/provider). Filters come from lib/paymentFilters,
// the same definition the on-screen tables use, so a file never contains
// different rows from the table the admin exported it from.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filters = parsePaymentFilters(searchParams);
  const eventId = filters.eventId;
  const format = searchParams.get("format");
  const where = paymentWhere(filters);

  // Never hand over a silently truncated file: a partial ledger looks
  // complete. Past the cap, ask for narrower filters instead.
  const total = await prisma.payment.count({ where });
  if (total > EXPORT_CAP) {
    return NextResponse.json(
      { error: `This export would contain ${total} payments (limit ${EXPORT_CAP}). Narrow the date range or filters and export in parts.` },
      { status: 413 },
    );
  }

  const payments = await prisma.payment.findMany({
    where,
    include: {
      application: { select: { businessName: true, contactName: true, email: true, phone: true, event: { select: { name: true } } } },
      booths: { select: { booth: { select: { code: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: EXPORT_CAP,
  });

  const rows = payments.map((p) => ({
    event: p.application.event.name,
    business: p.application.businessName,
    contact: p.application.contactName,
    email: p.application.email,
    phone: p.application.phone,
    booth: formatBoothCodes(p.booths.map((pb) => pb.booth.code)),
    amountAed: filsToAed(p.amountAedFils),
    status: p.status,
    provider: p.provider,
    method: p.method ?? "",
    reference: p.providerRef ?? "",
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt ? p.paidAt.toISOString() : "",
    // Appended after the original columns so existing spreadsheets that
    // read columns by position keep working.
    lifecycle: lifecycleStatus(p),
    refundedAed: filsToAed(p.refundedAedFils),
    receiptNumber: p.receiptNumber ?? "",
    needsAttention: p.needsAttention ?? "",
  }));

  const filenameBase = eventId ? "dah-event-payments" : "dah-all-transactions";

  if (format === "xlsx") {
    const buffer = await toXlsxBuffer(rows, "Payments");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}-${Date.now()}.xlsx"`,
      },
    });
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filenameBase}-${Date.now()}.csv"`,
    },
  });
}
