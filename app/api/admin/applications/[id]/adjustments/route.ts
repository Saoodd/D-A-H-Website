import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const amountAedFils = Math.round(Number(body.amountAedFils));
  const reason = String(body.reason || "").trim();
  if (!Number.isFinite(amountAedFils) || amountAedFils === 0 || !reason) {
    return NextResponse.json({ error: "Amount and reason are required." }, { status: 400 });
  }

  const application = await prisma.application.findUnique({ where: { id } });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const adjustment = await prisma.adjustment.create({
    data: { applicationId: id, amountAedFils, reason, createdByAdmin: true },
  });

  return NextResponse.json({ ok: true, adjustment });
}
