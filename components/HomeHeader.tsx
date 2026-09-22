"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n/context";

// Homepage-only navigation: transparent + light-on-photo at the top of the
// full-bleed hero, crossfading to the site's normal solid header treatment
// once the hero has scrolled past. Deliberately NOT the shared SiteHeader
// component — this needs a second visual state (transparent) that no other
// page uses, and duplicating a handful of links here keeps every other
// page's header (SiteHeader) completely untouched. See SiteChrome.tsx for
// the route-based swap.
export function HomeHeader({ vendorLoggedIn }: { vendorLoggedIn: boolean }) {
  const { t, dir } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  const solid = scrolled || open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid ? "bg-cream-soft/95 backdrop-blur border-b border-brown/10" : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="container-page flex items-center justify-between py-3.5 md:py-4">
        <Link href="/" aria-label="Dar Al Hay home" className="shrink-0">
          {solid ? (
            <span className="inline-flex items-center">
              <Image
                src="/brand/logo-dark-sm.png"
                alt="Dar Al Hay"
                width={91}
                height={100}
                priority
                className="theme-light-only h-9 w-auto"
              />
              <Image
                src="/brand/logo-light-sm.png"
                alt="Dar Al Hay"
                width={100}
                height={100}
                priority
                className="theme-dark-only h-9 w-auto"
              />
            </span>
          ) : (
            <Image src="/brand/logo-light-sm.png" alt="Dar Al Hay" width={100} height={100} priority className="h-9 w-auto" />
          )}
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm">
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`transition-colors ${
                  solid
                    ? active
                      ? "text-brown-dark"
                      : "text-brown-light hover:text-brown-dark"
                    : active
                      ? "text-white"
                      : "text-white/75 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          {vendorLoggedIn ? (
            <div className={`flex items-center gap-4 text-sm ${solid ? "" : "text-white/85"}`}>
              <Link
                href="/vendor/dashboard"
                className={solid ? "text-brown-dark hover:text-brown-light transition-colors" : "hover:text-white transition-colors"}
              >
                {t("nav.myProfile")}
              </Link>
              <button
                onClick={signOut}
                className={solid ? "text-brown-light hover:text-brown-dark transition-colors" : "hover:text-white transition-colors"}
              >
                {t("nav.signOut")}
              </button>
            </div>
          ) : (
            <Link
              href="/vendor/login"
              className={`text-sm transition-colors ${solid ? "text-brown-light hover:text-brown-dark" : "text-white/80 hover:text-white"}`}
            >
              {t("nav.logIn")}
            </Link>
          )}

          <Link
            href="/vendors"
            className={`px-5 py-2 rounded-full text-sm font-medium tracking-wide transition-colors ${
              solid ? "bg-brown text-cream-soft hover:bg-brown-dark" : "bg-white text-black hover:bg-white/90"
            }`}
          >
            {t("nav.becomeVendor")}
          </Link>

          <HeaderLangToggle solid={solid} />
        </div>

        <button
          className={`md:hidden p-2 -mr-2 ${dir === "rtl" ? "-ml-2 mr-0" : ""}`}
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`block w-6 h-0.5 mb-1.5 transition-colors ${solid ? "bg-brown" : "bg-white"}`} />
          <span className={`block w-6 h-0.5 mb-1.5 transition-colors ${solid ? "bg-brown" : "bg-white"}`} />
          <span className={`block w-6 h-0.5 transition-colors ${solid ? "bg-brown" : "bg-white"}`} />
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-cream-soft border-t border-brown/10">
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
                <Link href="/vendor/login" onClick={() => setOpen(false)} className="text-brown-light">
                  {t("nav.logIn")}
                </Link>
              )}
              <Link
                href="/vendors"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-brown text-cream-soft font-medium w-fit"
              >
                {t("nav.becomeVendor")}
              </Link>
              <HeaderLangToggle solid className="w-fit" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

// Not the shared LanguageToggle component: that one ships fixed
// border/hover colors tuned for the site's normal solid header, which
// wouldn't reliably override for the transparent-over-photo state here.
function HeaderLangToggle({ solid, className = "" }: { solid: boolean; className?: string }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "en" ? "ar" : "en")}
      aria-label="Toggle language"
      className={`text-xs tracking-wide rounded-full px-3 py-1.5 border transition-colors ${
        solid
          ? "border-brown/30 hover:bg-brown hover:text-cream-soft"
          : "border-white/40 text-white hover:bg-white hover:text-black"
      } ${className}`}
    >
      {t("lang.toggle")}
    </button>
  );
}
