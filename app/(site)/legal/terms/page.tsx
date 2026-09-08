import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Terms & Conditions" };

export default async function TermsPage() {
  const settings = await getSettings();
  return (
    <LegalPage title="Terms & Conditions">
      <p>
        These Terms & Conditions govern any vendor&rsquo;s application for, and booking of, a
        booth at a Dar Al Hay (DAH) event. By submitting an application or completing payment for
        a booth, the vendor agrees to be bound by these terms.
      </p>
      <p>
        <strong>1. Application &amp; acceptance.</strong> Submitting an application does not
        guarantee a booth. DAH reviews every application and may accept or decline it at its sole
        discretion. An accepted vendor must complete payment within the deadline stated on their
        dashboard to confirm their booth.
      </p>
      <p>
        <strong>2. Booth selection.</strong> Booths are selected on a first-confirmed basis via
        the vendor dashboard. A booth selection is held temporarily while the vendor completes
        checkout and is not confirmed until payment succeeds.
      </p>
      <p>
        <strong>3. Vendor obligations.</strong>{" "}
        {settings.tradeLicenseRequired
          ? "Vendors must hold a valid trade license, "
          : "Vendors should hold a valid trade license where applicable to their business — DAH may ask for one before confirming a booking, "}
        arrive and depart within the published event hours, keep their booth in good order, and
        comply with venue and municipality rules.
      </p>
      <p>
        <strong>4. Fees.</strong> Booth fees are as displayed at checkout and are VAT-inclusive
        unless stated otherwise. DAH may add a manual adjustment to a booking with a stated reason
        (e.g. additional equipment, a late setup fee agreed in advance).
      </p>
      <p>
        <strong>5. Cancellations.</strong> Bookings are non-refundable once paid, except where DAH
        specifically approves an exception. See our Refund &amp; Cancellation Policy.
      </p>
      <p>
        <strong>6. Liability.</strong> DAH is not liable for loss, damage or injury arising from a
        vendor&rsquo;s participation, except where required by law.
      </p>
    </LegalPage>
  );
}
