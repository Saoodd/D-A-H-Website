import type { Metadata } from "next";
import { ensureVendorTermsExist, getPublishedAgreement } from "@/lib/agreements";
import { sanitizeAgreementHtml } from "@/lib/sanitizeHtml";

export const metadata: Metadata = {
  title: "Vendor Terms & Conditions",
  description: "The Terms & Conditions every Dar Al Hay vendor accepts when creating a business account.",
  alternates: { canonical: "/vendor-terms" },
};

export default async function VendorTermsPage() {
  await ensureVendorTermsExist();
  const agreement = await getPublishedAgreement("VENDOR_TERMS", null);

  return (
    <div className="container-page py-16 max-w-2xl">
      <h1 className="font-heading text-3xl text-brown-dark mb-1">{agreement?.title ?? "Vendor Terms & Conditions"}</h1>
      {agreement && <p className="text-xs text-brown-light mb-6">Version {agreement.version}</p>}
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: agreement ? sanitizeAgreementHtml(agreement.bodyHtml) : "" }}
      />
    </div>
  );
}
