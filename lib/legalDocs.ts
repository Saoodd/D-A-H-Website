// The public legal pages (Privacy Policy, Terms & Conditions, Refund &
// Cancellation Policy), managed from Admin → Legal Pages. They reuse the
// Agreement table's draft/publish/version machinery under their own types,
// but are public documents: nobody "accepts" them, and they are entirely
// separate from the Signup Terms and per-event Vendor Event Terms that
// vendors do accept.
//
// Until an admin publishes a version, each page shows the built-in default
// text below. The first draft of each document starts from that default.

export const LEGAL_DOC_TYPES = ["PRIVACY_POLICY", "WEBSITE_TERMS", "REFUND_POLICY"] as const;
export type LegalDocType = (typeof LEGAL_DOC_TYPES)[number];

export const LEGAL_DOCS: Record<LegalDocType, { slug: string; title: string; path: string }> = {
  PRIVACY_POLICY: { slug: "privacy", title: "Privacy Policy", path: "/legal/privacy" },
  WEBSITE_TERMS: { slug: "terms", title: "Terms & Conditions", path: "/legal/terms" },
  REFUND_POLICY: { slug: "refunds", title: "Refund & Cancellation Policy", path: "/legal/refunds" },
};

export function isLegalDocType(value: unknown): value is LegalDocType {
  return typeof value === "string" && (LEGAL_DOC_TYPES as readonly string[]).includes(value);
}

export function legalDocBySlug(slug: string): LegalDocType | null {
  return LEGAL_DOC_TYPES.find((t) => LEGAL_DOCS[t].slug === slug) ?? null;
}

export function defaultLegalHtml(type: LegalDocType, opts: { tradeLicenseRequired: boolean }): string {
  switch (type) {
    case "PRIVACY_POLICY":
      return `
<p>Dar Al Hay (DAH) collects the information vendors and visitors submit through this site — including business and contact details submitted with a vendor application, and messages sent through the contact form — to operate our events and communicate with applicants and vendors.</p>
<p><strong>What we collect.</strong> Business name, contact name, email, phone number, social media handles, application details, and payment records (processed by our payment provider — we do not store full card details).</p>
<p><strong>How we use it.</strong> To review and manage vendor applications, run bookings and payments, send transactional emails (application status, receipts, WhatsApp group links), and respond to enquiries.</p>
<p><strong>Sharing.</strong> We do not sell vendor or visitor data. Information may be shared with service providers strictly to operate the site (e.g. our email and payment providers).</p>
<p><strong>Your rights.</strong> Vendors may request access to, correction of, or deletion of their data by contacting us.</p>`.trim();
    case "WEBSITE_TERMS":
      return `
<p>These Terms &amp; Conditions govern any vendor’s application for, and booking of, a booth at a Dar Al Hay (DAH) event. By submitting an application or completing payment for a booth, the vendor agrees to be bound by these terms.</p>
<p><strong>1. Application &amp; acceptance.</strong> Submitting an application does not guarantee a booth. DAH reviews every application and may accept or decline it at its sole discretion. An accepted vendor must complete payment within the deadline stated on their dashboard to confirm their booth.</p>
<p><strong>2. Booth selection.</strong> Booths are selected on a first-confirmed basis via the vendor dashboard. A booth selection is held temporarily while the vendor completes checkout and is not confirmed until payment succeeds.</p>
<p><strong>3. Vendor obligations.</strong> ${
        opts.tradeLicenseRequired
          ? "Vendors must hold a valid trade license, "
          : "Vendors should hold a valid trade license where applicable to their business — DAH may ask for one before confirming a booking, "
      }arrive and depart within the published event hours, keep their booth in good order, and comply with venue and municipality rules.</p>
<p><strong>4. Fees.</strong> Booth fees are as displayed at checkout and are VAT-inclusive unless stated otherwise. DAH may add a manual adjustment to a booking with a stated reason (e.g. additional equipment, a late setup fee agreed in advance).</p>
<p><strong>5. Cancellations.</strong> Bookings are non-refundable once paid, except where DAH specifically approves an exception. See our Refund &amp; Cancellation Policy.</p>
<p><strong>6. Liability.</strong> DAH is not liable for loss, damage or injury arising from a vendor’s participation, except where required by law.</p>`.trim();
    case "REFUND_POLICY":
      return `
<p>This policy covers booth bookings made through the Dar Al Hay (DAH) vendor dashboard.</p>
<p><strong>Bookings are non-refundable.</strong> Once a booth is confirmed and paid for, the booking fee is non-refundable. This applies regardless of the reason for cancelling or how close to the event date the cancellation is requested.</p>
<p><strong>Exceptions are at DAH’s discretion.</strong> A vendor with a confirmed, paid booth may submit a cancellation request from their dashboard or booking confirmation page. Submitting a request does not entitle the vendor to a refund — DAH reviews each request individually and may, at its sole discretion, approve a full or partial refund or a credit toward a future event. Any exception DAH approves will be confirmed directly with the vendor before it is processed.</p>
<p><strong>Unpaid, expired acceptances.</strong> If a vendor is accepted but does not complete payment within their acceptance deadline, their acceptance and any booth hold expire automatically — no charge is made, so no refund question arises.</p>
<p><strong>Adjustments.</strong> Any manual charge or adjustment added to a booking by DAH will always include a stated reason, visible to the vendor on request.</p>`.trim();
  }
}
