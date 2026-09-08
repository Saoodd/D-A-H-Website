import type { AgreementRecord } from "@/lib/agreementRecord";
import { PrintButton } from "./PrintButton";

/** The printable/downloadable record of a single agreement acceptance —
 *  reused by both the vendor's own copy and the admin view of the same
 *  record. Always renders the immutable snapshot text, never the current
 *  (possibly since-edited) live agreement. */
export function AgreementRecordView({ record, backHref, backLabel }: { record: AgreementRecord; backHref: string; backLabel: string }) {
  const acceptedLabel = new Date(record.acceptedAt).toLocaleString("en-AE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="container-page py-16 max-w-2xl">
      <div className="print:hidden flex items-center justify-between mb-8">
        <a href={backHref} className="text-sm text-brown-light underline">
          &larr; {backLabel}
        </a>
        <PrintButton label="Print / Save as PDF" />
      </div>

      <div className="rounded-2xl border border-brown/10 bg-cream-soft p-8 md:p-10 print:border-0 print:p-0">
        <p className="text-xs uppercase tracking-widest text-brown-light">Dar Al Hay Events</p>
        <h1 className="font-heading text-2xl text-brown-dark mt-1 mb-6">{record.title}</h1>

        <dl className="text-sm space-y-1.5 mb-8">
          <RecordRow label="Business" value={record.businessName} />
          <RecordRow label="Contact" value={record.contactName} />
          {record.representativeName && <RecordRow label="Authorized Representative" value={record.representativeName} />}
          {record.eventName && <RecordRow label="Event" value={record.eventName} />}
          {record.boothCode && <RecordRow label="Booth" value={record.boothCode} />}
          <RecordRow label="Agreement Version" value={`${record.version}`} />
          {record.applicationId && <RecordRow label="Application ID" value={record.applicationId} />}
          {record.bookingId && <RecordRow label="Booking ID" value={record.bookingId} />}
          <RecordRow label="Accepted" value={acceptedLabel} />
          {record.ipAddress && <RecordRow label="IP address" value={record.ipAddress} />}
        </dl>

        <div className="border-t border-brown/10 pt-6 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: record.bodyHtml }} />
      </div>
    </div>
  );
}

function RecordRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-brown-light shrink-0 w-44">{label}</dt>
      <dd className="text-brown-dark">{value}</dd>
    </div>
  );
}
