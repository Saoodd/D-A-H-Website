import { notFound } from "next/navigation";
import { getReceiptData } from "@/lib/receipts";
import { ReceiptView } from "@/components/receipts/ReceiptView";

export default async function AdminReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const receipt = await getReceiptData(paymentId);
  if (!receipt) notFound();

  return <ReceiptView receipt={receipt} backHref="/admin/payments" backLabel="Payments" />;
}
