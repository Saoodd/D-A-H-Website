import { redirect, notFound } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { getReceiptData } from "@/lib/receipts";
import { ReceiptView } from "@/components/receipts/ReceiptView";

export default async function VendorReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const { paymentId } = await params;
  const receipt = await getReceiptData(paymentId);
  if (!receipt || receipt.vendorId !== session.vendorId) notFound();

  return <ReceiptView receipt={receipt} backHref="/vendor/dashboard" backLabel="My Dashboard" />;
}
