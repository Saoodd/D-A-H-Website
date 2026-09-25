import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The Terms & Conditions for applying to and booking a booth at Dar Al Hay (DAH) events.",
  alternates: { canonical: "/legal/terms" },
};

// Content is managed in Admin → Legal Pages (see lib/legalDocs.ts).
export default function TermsPage() {
  return <LegalDocument type="WEBSITE_TERMS" />;
}
