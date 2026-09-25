import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { clearAttentionSchema } from "@/lib/validation";
import { logPaymentEvent } from "@/lib/bookingPayment";

// Marks a flagged payment as dealt with, with a note of what was done
// (e.g. "refunded by bank transfer", "booth B4 assigned manually").
export async function POST(req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { paymentId } = await params;
  const parsed = clearAttentionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a short note saying how this was resolved." }, { status: 400 });

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!payment.needsAttention) return NextResponse.json({ ok: true });

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { needsAttention: null } });
    await logPaymentEvent(tx, {
      paymentId,
      applicationId: payment.applicationId,
      type: "ATTENTION_CLEARED",
      actor: "ADMIN",
      detail: { was: payment.needsAttention, note: parsed.data.note },
    });
  });
  return NextResponse.json({ ok: true });
}
