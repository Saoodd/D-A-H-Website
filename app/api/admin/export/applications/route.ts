import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getDisplayStatus } from "@/lib/status";
import { toCsv } from "@/lib/csv";
import { filsToAed } from "@/lib/constants";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const applications = await prisma.application.findMany({
    include: { event: true, payments: { where: { status: "SUCCEEDED" } } },
    orderBy: { createdAt: "desc" },
  });

  const csv = toCsv(
    applications.map((a) => ({
      id: a.id,
      businessName: a.businessName,
      contactName: a.contactName,
      email: a.email,
      phone: a.phone,
      category: a.category,
      event: a.event.name,
      status: getDisplayStatus(a, a.payments.length > 0),
      submittedAt: a.createdAt.toISOString(),
      acceptanceExpiresAt: a.acceptanceExpiresAt ? a.acceptanceExpiresAt.toISOString() : "",
      amountPaidAed: a.payments[0] ? filsToAed(a.payments[0].amountAedFils) : "",
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="dah-applications-${Date.now()}.csv"`,
    },
  });
}
