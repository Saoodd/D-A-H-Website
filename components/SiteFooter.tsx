"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/context";
import { Logo } from "./Logo";

export function SiteFooter() {
  const { t } = useLocale();
  return (
    <footer className="mt-24 border-t border-brown/10 bg-cream">
      <div className="container-page py-12 flex flex-col md:flex-row md:justify-between gap-8">
        <div>
          <Logo className="items-start" />
          <p className="mt-4 text-sm text-brown-light max-w-xs">{t("footer.tagline")}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-10 text-sm">
          <div>
            <p className="font-heading text-brown mb-3">{t("nav.events")}</p>
            <ul className="space-y-2 text-brown-light">
              <li><Link href="/events" className="hover:text-brown">{t("nav.events")}</Link></li>
              <li><Link href="/vendors" className="hover:text-brown">{t("nav.vendors")}</Link></li>
              <li><Link href="/gallery" className="hover:text-brown">{t("nav.gallery")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-heading text-brown mb-3">{t("footer.legal")}</p>
            <ul className="space-y-2 text-brown-light">
              <li><Link href="/legal/terms" className="hover:text-brown">{t("footer.terms")}</Link></li>
              <li><Link href="/legal/privacy" className="hover:text-brown">{t("footer.privacy")}</Link></li>
              <li><Link href="/legal/refunds" className="hover:text-brown">{t("footer.refunds")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-heading text-brown mb-3">{t("nav.contact")}</p>
            <ul className="space-y-2 text-brown-light">
              <li><Link href="/contact" className="hover:text-brown">{t("nav.contact")}</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-brown/10 py-4 text-center text-xs text-brown-light">
        &copy; {new Date().getFullYear()} Dar Al Hay (DAH). {t("footer.rights")}
      </div>
    </footer>
  );
}
