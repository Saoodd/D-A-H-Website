"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  { label: "Agreements", links: [{ href: "/admin/agreements", label: "Agreements" }] },
  { label: "Management", links: [{ href: "/admin/settings", label: "Settings" }] },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-brown/10 bg-cream md:min-h-screen">
      <div className="p-5">
        <Logo className="scale-75 origin-left" />
        <p className="text-xs tracking-[0.3em] uppercase text-brown-light mt-2">Management Portal</p>
      </div>
      <nav className="flex md:flex-col overflow-x-auto md:overflow-visible px-3 pb-3 md:pb-0 gap-4 md:gap-5 text-sm">
        {groups.map((g, i) => (
          <div key={i} className="shrink-0 md:shrink">
            {g.label && <p className="label-caps px-3 mb-1 hidden md:block">{g.label}</p>}
            <div className="flex md:flex-col gap-1">
              {g.links.map((l) => {
                const active = pathname === l.href || (l.href !== "/admin" && pathname?.startsWith(l.href));
                return (
                  <Link
                    key={l.href}
                    href={l.href}
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
      <div className="p-5 hidden md:flex md:items-center md:justify-between gap-2 mt-4">
        <AdminLogoutButton />
        <ThemeToggle />
      </div>
    </aside>
  );
}
