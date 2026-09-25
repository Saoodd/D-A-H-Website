import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { isValidHttpUrl } from "@/lib/url";
import { ContactClient } from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact & Socials",
  description: "Get in touch with Dar Al Hay (DAH), or join our WhatsApp community.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const settings = await getSettings();
  return (
    <ContactClient
      communityLink={isValidHttpUrl(settings.mainCommunityWhatsappLink) ? settings.mainCommunityWhatsappLink : null}
      contactEmail={settings.contactEmail}
      contactInstagramHandle={settings.contactInstagramHandle}
    />
  );
}
