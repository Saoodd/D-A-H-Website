import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const hours = Number(body.hours);
  if (!hours || hours <= 0) return NextResponse.json({ error: "Enter a positive number of hours" }, { status: 400 });

  const application = await prisma.application.findUnique({ where: { id } });
  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (application.status !== "ACCEPTED" || !application.acceptanceExpiresAt) {
    return NextResponse.json({ error: "Only an active acceptance can be extended." }, { status: 400 });
  }

  const newExpiry = new Date(application.acceptanceExpiresAt.getTime() + hours * 60 * 60 * 1000);
  const updated = await prisma.application.update({
    where: { id },
    data: { acceptanceExpiresAt: newExpiry },
  });

  return NextResponse.json({ ok: true, application: updated });
}
