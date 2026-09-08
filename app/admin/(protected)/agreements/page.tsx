import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/Card";
import { AgreementEditor } from "@/components/admin/AgreementEditor";
import { AgreementRecordsTable } from "@/components/admin/AgreementRecordsTable";

export const metadata: Metadata = { title: "Agreements — Admin" };

export default function AdminAgreementsPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Agreements"
        description="Vendor Account Agreements are accepted once, at signup. Event Agreements are separate per event — write and publish each one from that event's own Terms & Conditions tab."
      />

      <div className="mb-8 rounded-[10px] border border-brown/10 bg-cream p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-medium text-brown-dark">Looking for one event&rsquo;s Terms &amp; Conditions?</p>
          <p className="text-xs text-brown-light mt-1">Each event has its own independent agreement — open it from that event&rsquo;s workspace.</p>
        </div>
        <Link href="/admin/events" className="text-sm underline text-brown whitespace-nowrap">
          Go to Events →
        </Link>
      </div>

      <div className="max-w-3xl">
        <p className="label-caps mb-4">Vendor Account Agreements</p>
        <AgreementEditor type="VENDOR_TERMS" scopeLabel="Vendor Terms & Conditions" />
      </div>

      <div className="mt-14">
        <p className="label-caps mb-4">All Signed Agreements</p>
        <AgreementRecordsTable />
      </div>
    </div>
  );
}
