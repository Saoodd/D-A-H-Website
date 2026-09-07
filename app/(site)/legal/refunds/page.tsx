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
        <strong>Requesting a cancellation.</strong> A vendor with a confirmed, paid booth may
        request a cancellation from their dashboard or booking confirmation page. This submits a
        request to DAH — it does not automatically process a refund.
      </p>
      <p>
        <strong>Review &amp; refunds.</strong> Our team reviews every cancellation request
        individually and processes any applicable refund manually via the original payment
        method. Refund amounts and eligibility depend on how close to the event date the request
        is made — DAH will confirm the outcome directly with the vendor.
      </p>
      <p>
        <strong>Unpaid, expired acceptances.</strong> If a vendor is accepted but does not
        complete payment within their acceptance deadline, their acceptance and any booth hold
        expire automatically — no charge is made and no refund is applicable.
      </p>
      <p>
        <strong>Adjustments.</strong> Any manual charge or adjustment added to a booking by DAH
        will always include a stated reason, visible to the vendor on request.
      </p>
    </LegalPage>
  );
}
