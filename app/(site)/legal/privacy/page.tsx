import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Dar Al Hay (DAH) collects, uses and protects the information vendors and visitors share.",
  alternates: { canonical: "/legal/privacy" },
};

// Content is managed in Admin → Legal Pages (see lib/legalDocs.ts).
export default function PrivacyPage() {
  return <LegalDocument type="PRIVACY_POLICY" />;
}
