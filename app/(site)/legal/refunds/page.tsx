import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Refund & Cancellation Policy" };

export default function RefundsPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy">
      <p>
        This policy covers booth bookings made through the Dar Al Hay (DAH) vendor dashboard.
      </p>
      <p>
        <strong>Bookings are non-refundable.</strong> Once a booth is confirmed and paid for, the
        booking fee is non-refundable. This applies regardless of the reason for cancelling or how
        close to the event date the cancellation is requested.
      </p>
      <p>
        <strong>Exceptions are at DAH&rsquo;s discretion.</strong> A vendor with a confirmed, paid
        booth may submit a cancellation request from their dashboard or booking confirmation page.
        Submitting a request does not entitle the vendor to a refund — DAH reviews each request
        individually and may, at its sole discretion, approve a full or partial refund or a credit
        toward a future event. Any exception DAH approves will be confirmed directly with the
        vendor before it is processed.
      </p>
      <p>
        <strong>Unpaid, expired acceptances.</strong> If a vendor is accepted but does not
        complete payment within their acceptance deadline, their acceptance and any booth hold
        expire automatically — no charge is made, so no refund question arises.
      </p>
      <p>
        <strong>Adjustments.</strong> Any manual charge or adjustment added to a booking by DAH
        will always include a stated reason, visible to the vendor on request.
      </p>
    </LegalPage>
  );
}
