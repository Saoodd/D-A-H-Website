import { notFound } from "next/navigation";
import { getReceiptData } from "@/lib/receipts";
import { ReceiptView } from "@/components/receipts/ReceiptView";

export default async function AdminReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { paymentId } = await params;
  const { mode } = await searchParams;
  const receipt = await getReceiptData(paymentId);
  if (!receipt) notFound();

  return <ReceiptView receipt={receipt} backHref="/admin/payments" backLabel="Payments" autoPrint={mode === "download"} />;
}
