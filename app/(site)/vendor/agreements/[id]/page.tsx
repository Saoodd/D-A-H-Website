import { redirect, notFound } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { getAgreementRecord } from "@/lib/agreementRecord";
import { AgreementRecordView } from "@/components/agreements/AgreementRecordView";

export default async function VendorAgreementRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const { id } = await params;
  const record = await getAgreementRecord(id);
  if (!record || record.vendorId !== session.vendorId) notFound();

  return <AgreementRecordView record={record} backHref="/vendor/agreements" backLabel="Agreements & Documents" />;
}
