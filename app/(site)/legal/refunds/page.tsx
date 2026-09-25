import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "Dar Al Hay (DAH)'s refund and cancellation policy for booth bookings.",
  alternates: { canonical: "/legal/refunds" },
};

// Content is managed in Admin → Legal Pages (see lib/legalDocs.ts).
export default function RefundsPage() {
  return <LegalDocument type="REFUND_POLICY" />;
}
