import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";

export const metadata: Metadata = { title: "Refund & Cancellation Policy" };

// Content is managed in Admin → Legal Pages (see lib/legalDocs.ts).
export default function RefundsPage() {
  return <LegalDocument type="REFUND_POLICY" />;
}
