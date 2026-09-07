"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";
import { LanguageToggle } from "./LanguageToggle";
import { useLocale } from "@/lib/i18n/context";

export function SiteHeader({ vendorLoggedIn }: { vendorLoggedIn: boolean }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/", label: t("nav.home") },
    { href: "/markets", label: t("nav.markets") },
    { href: "/vendors", label: t("nav.vendors") },
    { href: "/gallery", label: t("nav.gallery") },
    { href: "/contact", label: t("nav.contact") },
  ];

  return (
    <header className="sticky top-0 z-40 bg-cream-soft/90 backdrop-blur border-b border-brown/10">
      <div className="container-page flex items-center justify-between py-3">
        <Link href="/" aria-label="Dar Al Hay home">
          <Logo />
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-brown-light transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link
            href={vendorLoggedIn ? "/vendor/dashboard" : "/vendor/login"}
            className="text-sm border border-brown/30 rounded-full px-4 py-1.5 hover:bg-brown hover:text-cream-soft transition-colors"
          >
            {vendorLoggedIn ? t("nav.vendorDashboard") : t("nav.vendorLogin")}
          </Link>
          <LanguageToggle />
        </div>

        <button
          className="md:hidden p-2"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="block w-6 h-0.5 bg-brown mb-1.5" />
          <span className="block w-6 h-0.5 bg-brown mb-1.5" />
          <span className="block w-6 h-0.5 bg-brown" />
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-brown/10 bg-cream-soft">
          <div className="container-page py-4 flex flex-col gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <Link href={vendorLoggedIn ? "/vendor/dashboard" : "/vendor/login"} onClick={() => setOpen(false)}>
              {vendorLoggedIn ? t("nav.vendorDashboard") : t("nav.vendorLogin")}
            </Link>
            <LanguageToggle className="self-start" />
          </div>
        </div>
      )}
    </header>
  );
}
