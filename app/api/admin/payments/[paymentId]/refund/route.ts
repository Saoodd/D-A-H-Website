import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { refundSchema } from "@/lib/validation";
import { recordRefund } from "@/lib/refunds";

export async function POST(req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { paymentId } = await params;
  const parsed = refundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter an amount, a method and a reason (at least 3 characters)." }, { status: 400 });
  const result = await recordRefund({ paymentId, ...parsed.data, reference: parsed.data.reference || null });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
