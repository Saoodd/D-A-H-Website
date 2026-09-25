import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { toCsv } from "@/lib/csv";
import { toXlsxBuffer } from "@/lib/xlsx";
import { filsToAed, formatBoothCodes } from "@/lib/constants";

// Shared export for both the per-event Payments workspace (always passes
// `eventId`, so its file can never contain another event's transactions)
// and the All Transactions view (omits `eventId`, filters instead by
// business/status/date/provider) — one query builder, one row shape, so
// the two exports never drift out of sync with each other or the on-screen
// table.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const q = searchParams.get("q")?.trim() || "";
  const status = searchParams.get("status");
  const provider = searchParams.get("provider")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const format = searchParams.get("format");

  const where: Record<string, unknown> = {};
  if (eventId) where.eventId = eventId;
  if (status && ["SUCCEEDED", "PENDING", "FAILED"].includes(status)) where.status = status;
  if (provider) where.provider = { equals: provider, mode: "insensitive" as const };
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
  }
  if (q) {
    where.application = { businessName: { contains: q, mode: "insensitive" as const } };
  }

  const payments = await prisma.payment.findMany({
    where,
    include: {
      application: { select: { businessName: true, contactName: true, email: true, phone: true, event: { select: { name: true } } } },
      booths: { select: { booth: { select: { code: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
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
