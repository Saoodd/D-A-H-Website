import { NextResponse } from "next/server";
import { getVendorSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { refreshFromProvider } from "@/lib/paymentProcessing";
import { getVendorPaymentView } from "@/lib/paymentView";

// Polled by the payment return page. Asks the provider (server to server,
// at most every few seconds per payment) before answering, so the page
// resolves even if the webhook is slow. Never changes state on the
// browser's word.
export async function GET(_req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { paymentId } = await params;

  const view = await getVendorPaymentView(paymentId, session.vendorId);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if ((view.lifecycle === "PENDING" || view.lifecycle === "AUTHORIZED" || view.lifecycle === "CREATED") && (await rateLimit(`payment-refresh:${paymentId}`, 1, 4000))) {
    await refreshFromProvider(paymentId, "return-page").catch((err) => console.error("[payments] refresh failed:", err instanceof Error ? err.message : err));
    return NextResponse.json(await getVendorPaymentView(paymentId, session.vendorId));
  }
  return NextResponse.json(view);
}
