import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/Card";
import { AgreementEditor } from "@/components/admin/AgreementEditor";
import { LEGAL_DOC_TYPES, LEGAL_DOCS, legalDocBySlug } from "@/lib/legalDocs";

export const metadata: Metadata = { title: "Legal Pages — Admin" };

// Public Privacy / Terms / Refund pages. Draft, preview and publish reuse
// the agreement editor; these documents are published, never accepted,
// and are separate from Signup Terms and per-event Vendor Event Terms.
export default async function AdminLegalPagesPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const { doc } = await searchParams;
  const type = legalDocBySlug(doc ?? "") ?? "PRIVACY_POLICY";
  const current = LEGAL_DOCS[type];

  return (
    <div className="max-w-5xl">
      <PageHeader
        eyebrow="Content → Legal Pages"
        title="Legal Pages"
        description="The public Privacy Policy, Terms & Conditions and Refund & Cancellation Policy. Edit a draft, preview it, then publish; every published version is kept. Vendor agreements (Signup Terms, Event Terms) are managed under Agreements."
      />

      <nav className="mb-8 flex flex-wrap gap-2" aria-label="Legal documents">
        {LEGAL_DOC_TYPES.map((t) => (
          <Link
            key={t}
            href={`/admin/legal?doc=${LEGAL_DOCS[t].slug}`}
            aria-current={t === type ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              t === type ? "border-brown bg-brown text-cream-soft" : "border-brown/20 text-brown-dark hover:bg-brown/5"
            }`}
          >
            {LEGAL_DOCS[t].title}
          </Link>
        ))}
      </nav>

      <div className="max-w-3xl">
        <p className="mb-4 text-sm text-brown-light">
          Public page:{" "}
          <Link href={current.path} target="_blank" className="text-brown-dark underline underline-offset-2">
            {current.path}
          </Link>
        </p>
        <AgreementEditor key={type} type={type} scopeLabel={current.title} />
      </div>
    </div>
  );
}
