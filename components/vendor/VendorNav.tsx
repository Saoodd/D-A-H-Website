"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";

const links = [
  { href: "/vendor/dashboard", key: "vendorNav.overview" as const },
  { href: "/vendor/profile", key: "vendorNav.profile" as const },
];

/** Shared left sidebar (desktop) / top scroll bar (mobile) across the vendor
 *  dashboard and profile pages — kept as a small standalone component
 *  rather than a route-group layout, so it can be dropped into either page
 *  without restructuring the existing routes. */
export function VendorNav({ businessName }: { businessName: string }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/vendor/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="md:w-48 shrink-0">
      <p className="hidden md:block text-xs uppercase tracking-widest text-brown-light mb-4 truncate">{businessName}</p>
      <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-2 md:pb-0">
        {links.map((l) => {
          const active = pathname === l.href || pathname?.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`shrink-0 px-3 py-2 rounded-[6px] text-sm whitespace-nowrap transition-colors ${
                active ? "bg-brown text-cream-soft" : "text-brown-dark hover:bg-brown/8"
              }`}
            >
              {t(l.key)}
            </Link>
          );
        })}
        <button
          onClick={logout}
          className="shrink-0 px-3 py-2 rounded-[6px] text-sm text-brown-light hover:bg-brown/8 text-left"
        >
          {t("vendorNav.logout")}
        </button>
      </div>
    </nav>
  );
}
