import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { ContactClient } from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact & Socials",
  description: "Get in touch with Dar Al Hay (DAH), or join our WhatsApp community.",
};

export default async function ContactPage() {
  const settings = await getSettings();
  return (
    <ContactClient
      communityLink={settings.mainCommunityWhatsappLink}
      contactEmail={settings.contactEmail}
      contactInstagramHandle={settings.contactInstagramHandle}
    />
  );
}
