import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/Card";
import { AgreementEditor } from "@/components/admin/AgreementEditor";
import { AgreementRecordsTable } from "@/components/admin/AgreementRecordsTable";

export const metadata: Metadata = { title: "Signup Terms — Admin" };

export default function AdminSignupTermsPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Agreements → Signup Terms"
        title="Signup Terms & Conditions"
        description="The single, permanent DAH account agreement every vendor accepts once, when they create their business account — not tied to any one event."
      />

      <div className="max-w-3xl">
        <AgreementEditor type="VENDOR_TERMS" scopeLabel="Signup Terms & Conditions" />
      </div>

      <div className="mt-14">
        <p className="label-caps mb-4">Signed Vendors</p>
        <AgreementRecordsTable lockType="VENDOR_TERMS" />
      </div>
    </div>
  );
}
