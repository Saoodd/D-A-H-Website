import { LegalPage } from "@/components/LegalPage";
import { getPublishedAgreement } from "@/lib/agreements";
import { sanitizeAgreementHtml } from "@/lib/sanitizeHtml";
import { getSettings } from "@/lib/settings";
import { LEGAL_DOCS, defaultLegalHtml, type LegalDocType } from "@/lib/legalDocs";

/** A public legal page: the version published in Admin → Legal Pages, or
 *  the built-in default text until one is published. */
export async function LegalDocument({ type }: { type: LegalDocType }) {
  const published = await getPublishedAgreement(type, null);
  const html = published ? published.bodyHtml : defaultLegalHtml(type, await getSettings());
  return (
    <LegalPage
      title={published?.title ?? LEGAL_DOCS[type].title}
      updated={published?.publishedAt ?? null}
    >
      <div dangerouslySetInnerHTML={{ __html: sanitizeAgreementHtml(html) }} />
    </LegalPage>
  );
}
