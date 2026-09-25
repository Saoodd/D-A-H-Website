import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { getVendorPaymentView } from "@/lib/paymentView";
import { refreshFromProvider } from "@/lib/paymentProcessing";
import { PaymentReturnClient } from "./PaymentReturnClient";

export const metadata: Metadata = { title: "Payment status" };

// Where a payment provider sends the payer back. Only DISPLAYS the
// payment's state; query parameters from the provider are never trusted
// to mark anything paid (that's the webhook's and reconciliation's job).
export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");
  const { paymentId } = await params;
  const { cancelled } = await searchParams;

  if (!(await getVendorPaymentView(paymentId, session.vendorId))) notFound();
  await refreshFromProvider(paymentId, "return-page").catch(() => undefined);
  const view = (await getVendorPaymentView(paymentId, session.vendorId))!;

  return <PaymentReturnClient initial={view} cancelledHint={cancelled === "1"} />;
}
