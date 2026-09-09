import { redirect, notFound } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { getReceiptData } from "@/lib/receipts";
import { ReceiptView } from "@/components/receipts/ReceiptView";

export default async function VendorReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const { paymentId } = await params;
  const { mode } = await searchParams;
  const receipt = await getReceiptData(paymentId);
  if (!receipt || receipt.vendorId !== session.vendorId) notFound();

  return <ReceiptView receipt={receipt} backHref="/vendor/dashboard" backLabel="My Dashboard" autoPrint={mode === "download"} />;
}
