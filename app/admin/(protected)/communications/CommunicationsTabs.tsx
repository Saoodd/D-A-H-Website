"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/communications/new", label: "Compose" },
  { href: "/admin/communications", label: "History" },
  { href: "/admin/communications/templates", label: "Templates" },
  { href: "/admin/communications/registry", label: "Template Registry" },
];

// Delivery Logs live inside each communication's own Detail page (a global
// cross-campaign log would just duplicate what's already there per
// campaign) — see CommunicationDetailClient.
export function CommunicationsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1 border-b border-brown/10 mb-6 -mt-2">
      {TABS.map((t) => {
        const active = t.href === "/admin/communications" ? pathname === t.href : pathname?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-2.5 text-sm rounded-t-[6px] border-b-2 transition-colors ${
              active ? "border-brown text-brown-dark font-medium" : "border-transparent text-brown-light hover:text-brown-dark"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
