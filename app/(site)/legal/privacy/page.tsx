import type { Metadata } from "next";
import { LegalDocument } from "@/components/LegalDocument";

export const metadata: Metadata = { title: "Privacy Policy" };

// Content is managed in Admin → Legal Pages (see lib/legalDocs.ts).
export default function PrivacyPage() {
  return <LegalDocument type="PRIVACY_POLICY" />;
}
