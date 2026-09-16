"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { AdminLogoutButton } from "./AdminLogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

const groups: { label: string; links: { href: string; label: string }[] }[] = [
  { label: "", links: [{ href: "/admin", label: "Overview" }] },
  { label: "Events", links: [{ href: "/admin/events", label: "Events" }] },
  {
    label: "Vendors",
    links: [
      { href: "/admin/applications", label: "Applications" },
      { href: "/admin/vendors", label: "Vendors" },
    ],
  },
  {
    label: "Finance",
    links: [
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/pricing", label: "Pricing" },
    ],
  },
  { label: "Content", links: [{ href: "/admin/gallery", label: "Gallery" }] },
  {
    label: "Agreements",
    links: [
      { href: "/admin/agreements/signup", label: "Signup Terms" },
      { href: "/admin/agreements/events", label: "Event Terms" },
    ],
  },
  {
    label: "Management",
    links: [
      { href: "/admin/communications", label: "Communications" },
      { href: "/admin/emails", label: "Emails" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

function isActiveLink(pathname: string | null, href: string) {
  return pathname === href || (href !== "/admin" && pathname?.startsWith(href));
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close the drawer on every route change — a section link should always
  // land you on the page, not leave the drawer covering it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing open state to router navigation, not derived render state
    setOpen(false);
  }, [pathname]);

  // Escape closes the drawer and returns focus to the trigger, matching
  // standard dialog keyboard behavior.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Move focus into the drawer when it opens so keyboard users land
  // somewhere useful immediately, per standard dialog behavior.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  const navContent = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-5 text-sm">
      {groups.map((g, i) => (
        <div key={i}>
          {g.label && <p className="label-caps px-3 mb-1">{g.label}</p>}
          <div className="flex flex-col gap-1">
            {g.links.map((l) => {
              const active = isActiveLink(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap px-3 py-2 rounded-[6px] transition-colors ${
                    active ? "bg-brown text-cream-soft" : "text-brown-dark hover:bg-brown/10"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar — unchanged from before. */}
      <aside className="hidden md:flex md:w-56 md:flex-col shrink-0 border-r border-brown/10 bg-cream md:min-h-screen">
        <div className="p-5">
          <Logo className="scale-75 origin-left" />
          <p className="text-xs tracking-[0.3em] uppercase text-brown-light mt-2">Management Portal</p>
        </div>
        <div className="px-3">{navContent()}</div>
        <div className="p-5 mt-auto flex items-center justify-between gap-2">
          <AdminLogoutButton />
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile top bar + slide-out drawer. */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-brown/10 bg-cream px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Logo className="scale-75 origin-left" />
          <p className="text-[10px] tracking-[0.25em] uppercase text-brown-light truncate">Management Portal</p>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Open admin menu"
          aria-expanded={open}
          aria-controls="admin-mobile-drawer"
          onClick={() => setOpen(true)}
          className="shrink-0 p-2 -m-2"
        >
          <span className="block w-6 h-0.5 bg-brown mb-1.5" />
          <span className="block w-6 h-0.5 bg-brown mb-1.5" />
          <span className="block w-6 h-0.5 bg-brown" />
        </button>
      </header>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Dismiss surface only — not a labeled control in its own right,
              so it never competes with the drawer's own Close button for
              screen-reader/tab focus. Escape and the visible × handle the
              accessible close paths. */}
          <div aria-hidden="true" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div
            id="admin-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-cream border-r border-brown/10 flex flex-col overflow-y-auto"
          >
            <div className="p-5 flex items-center justify-between gap-3">
              <div>
                <Logo className="scale-75 origin-left" />
                <p className="text-xs tracking-[0.3em] uppercase text-brown-light mt-2">Management Portal</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close admin menu"
                onClick={() => setOpen(false)}
                className="shrink-0 p-2 text-brown-dark text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="px-3 pb-3">{navContent(() => setOpen(false))}</div>
            <div className="p-5 mt-auto flex items-center justify-between gap-2 border-t border-brown/10">
              <AdminLogoutButton />
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
