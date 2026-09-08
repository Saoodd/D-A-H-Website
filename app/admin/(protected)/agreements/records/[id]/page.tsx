import { notFound } from "next/navigation";
import { getAgreementRecord } from "@/lib/agreementRecord";
import { AgreementRecordView } from "@/components/agreements/AgreementRecordView";

export default async function AdminAgreementRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getAgreementRecord(id);
  if (!record) notFound();

  return <AgreementRecordView record={record} backHref={`/admin/vendors/${record.vendorId}`} backLabel="Back to vendor" />;
}
