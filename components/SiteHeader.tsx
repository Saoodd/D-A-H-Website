"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";
import { useLocale } from "@/lib/i18n/context";

export function SiteHeader({ vendorLoggedIn }: { vendorLoggedIn: boolean }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/", label: t("nav.home") },
    { href: "/events", label: t("nav.events") },
    { href: "/gallery", label: t("nav.gallery") },
    { href: "/contact", label: t("nav.contact") },
  ];

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname?.startsWith(href + "/");
  }

  async function signOut() {
    await fetch("/api/vendor/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 bg-cream-soft/90 backdrop-blur border-b border-brown/10">
      <div className="container-page flex items-center justify-between py-3">
        <Link href="/" aria-label="Dar Al Hay home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden md:flex items-center gap-7 text-sm">
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative pb-1 transition-colors ${
                  active ? "text-brown-dark" : "text-brown-light hover:text-brown-dark"
                }`}
              >
                {l.label}
                <span
                  className={`absolute inset-x-0 -bottom-[3px] h-px bg-brown transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-5">
          <span className="w-px h-5 bg-brown/15" aria-hidden="true" />

          {vendorLoggedIn ? (
            <div className="flex items-center gap-4 text-sm">
              <Link href="/vendor/dashboard" className="text-brown-dark hover:text-brown-light transition-colors">
                {t("nav.myProfile")}
              </Link>
              <button onClick={signOut} className="text-brown-light hover:text-brown-dark transition-colors">
                {t("nav.signOut")}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4 text-sm">
              <Link href="/vendor/login" className="text-brown-light hover:text-brown-dark transition-colors">
                {t("nav.logIn")}
              </Link>
              <Link
                href="/vendors"
                className="text-brown-dark border-b border-brown/40 pb-0.5 hover:border-brown transition-colors"
              >
                {t("nav.becomeVendor")}
              </Link>
            </div>
          )}

          <ThemeToggle />
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
            {links.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={active ? "text-brown-dark font-medium" : "text-brown-light"}
                >
                  {l.label}
                </Link>
              );
            })}

            <div className="border-t border-brown/10 pt-4 flex flex-col gap-4">
              {vendorLoggedIn ? (
                <>
                  <Link href="/vendor/dashboard" onClick={() => setOpen(false)} className="text-brown-dark">
                    {t("nav.myProfile")}
                  </Link>
                  <button
                    onClick={() => {
                      setOpen(false);
                      signOut();
                    }}
                    className="text-brown-light text-left"
                  >
                    {t("nav.signOut")}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/vendors" onClick={() => setOpen(false)} className="text-brown-dark font-medium">
                    {t("nav.becomeVendor")}
                  </Link>
                  <Link href="/vendor/login" onClick={() => setOpen(false)} className="text-brown-light">
                    {t("nav.logIn")}
                  </Link>
                </>
              )}
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <LanguageToggle />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
