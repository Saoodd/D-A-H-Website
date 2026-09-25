import { Logo } from "@/components/Logo";
import { formatAed } from "@/lib/constants";
import type { ReceiptData } from "@/lib/receipts";
import { paymentMethodLabel } from "@/lib/paymentLabels";
import { PrintButton } from "@/components/agreements/PrintButton";
import { AutoPrint } from "@/components/receipts/AutoPrint";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" });
}


/** The printable/downloadable payment receipt — reused by both the
 *  vendor's own copy and the admin view of the same payment, always
 *  computed from the same lib/receipts.ts data so the two can never
 *  disagree. "Payment Receipt", deliberately not "Tax Invoice" — DAH isn't
 *  configured to issue compliant tax invoices, and this never claims to. */
export function ReceiptView({
  receipt,
  backHref,
  backLabel,
  autoPrint,
}: {
  receipt: ReceiptData;
  backHref: string;
  backLabel: string;
  autoPrint?: boolean;
}) {
  return (
    <div className="container-page py-16 max-w-2xl">
      {autoPrint && <AutoPrint />}
      <div className="print:hidden flex items-center justify-between mb-8">
        <a href={backHref} className="text-sm text-brown-light underline">
          &larr; {backLabel}
        </a>
        <PrintButton label="Print / Save as PDF" />
      </div>

      <div className="rounded-2xl border border-brown/10 bg-cream-soft p-8 md:p-10 print:border-0 print:p-0">
        <div className="flex items-start justify-between mb-8">
          <Logo className="items-start" />
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-brown-light">Payment Receipt</p>
            {receipt.receiptNumber && <p className="text-sm text-brown-dark font-medium mt-1">{receipt.receiptNumber}</p>}
          </div>
        </div>

        <dl className="text-sm space-y-1.5 mb-6">
          <Row label="Business" value={receipt.businessName} />
          <Row label="Contact" value={receipt.contactName} />
          <Row label="Email" value={receipt.email} />
          <Row label="Phone" value={receipt.phone} />
          <Row label="Event" value={receipt.eventName} />
          <Row label="Event Date" value={formatEventDate(receipt.eventStartDate)} />
          <Row label="Venue" value={receipt.eventLocation} />
          {receipt.booths.length <= 1 ? (
            <>
              <Row label="Booth" value={receipt.boothCode} />
              <Row label="Booth Size" value={receipt.boothSizeLabel} />
            </>
          ) : null}
        </dl>

        {receipt.booths.length > 1 && (
          <div className="border-t border-brown/10 pt-5 mb-6">
            <dl className="text-sm space-y-1.5">
              {receipt.booths.map((b) => (
                <div key={b.code} className="flex gap-2">
                  <dt className="text-brown-light shrink-0 w-44">
                    Booth {b.code} — {b.sizeLabel}
                  </dt>
                  <dd className="text-brown-dark">{formatAed(b.priceAedFils)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="border-t border-brown/10 pt-5 mb-6">
          <dl className="text-sm space-y-1.5">
            {receipt.vatApplicable && (
              <>
                <Row label="Subtotal" value={formatAed(receipt.subtotalAedFils)} />
                <Row label="VAT" value={formatAed(receipt.vatAedFils)} />
              </>
            )}
            <div className="flex gap-2 pt-1.5">
              <dt className="text-brown-dark font-medium shrink-0 w-44">Total Paid</dt>
              <dd className="text-brown-dark font-semibold text-base">{formatAed(receipt.totalAedFils)}</dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-brown/10 pt-5">
          <dl className="text-sm space-y-1.5">
            <Row label="Payment Status" value="Paid" />
            {receipt.paidAt && <Row label="Payment Date" value={formatDate(receipt.paidAt)} />}
            {receipt.providerRef && <Row label="Payment Reference" value={receipt.providerRef} />}
            <Row label="Payment Method" value={paymentMethodLabel(receipt)} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-brown-light shrink-0 w-44">{label}</dt>
      <dd className="text-brown-dark break-words">{value}</dd>
    </div>
  );
}
