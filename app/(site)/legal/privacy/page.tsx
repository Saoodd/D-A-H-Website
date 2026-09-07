import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Dar Al Hay (DAH) collects the information vendors and visitors submit through this site —
        including business and contact details submitted with a vendor application, and messages
        sent through the contact form — to operate our events and communicate with applicants and
        vendors.
      </p>
      <p>
        <strong>What we collect.</strong> Business name, contact name, email, phone number,
        social media handles, application details, and payment records (processed by our payment
        provider — we do not store full card details).
      </p>
      <p>
        <strong>How we use it.</strong> To review and manage vendor applications, run bookings and
        payments, send transactional emails (application status, receipts, WhatsApp group links),
        and respond to enquiries.
      </p>
      <p>
        <strong>Sharing.</strong> We do not sell vendor or visitor data. Information may be shared
        with service providers strictly to operate the site (e.g. our email and payment
        providers).
      </p>
      <p>
        <strong>Your rights.</strong> Vendors may request access to, correction of, or deletion of
        their data by contacting us.
      </p>
    </LegalPage>
  );
}
