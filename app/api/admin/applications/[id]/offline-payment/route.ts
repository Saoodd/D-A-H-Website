import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { offlinePaymentSchema } from "@/lib/validation";
import { recordOfflinePayment } from "@/lib/offlinePayment";
import { sendBookingConfirmedNotifications } from "@/lib/bookingPayment";

// Records a payment DAH collected outside the website (bank transfer, cash,
// card terminal) and confirms the vendor's reserved booth(s). The amount is
// never taken from the request — the server prices the held booths and the
// request must echo that exact total back (expectedAmountAedFils) as a
// confirmation. See lib/offlinePayment.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = offlinePaymentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a payment method and enter the payment reference." }, { status: 400 });
  }

  const result = await recordOfflinePayment({
    applicationId: id,
    method: parsed.data.method,
    reference: parsed.data.reference,
    note: parsed.data.note || null,
    expectedAmountAedFils: parsed.data.expectedAmountAedFils,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await sendBookingConfirmedNotifications(result.paymentId);
  return NextResponse.json({ ok: true, paymentId: result.paymentId, receiptNumber: result.receiptNumber });
}
