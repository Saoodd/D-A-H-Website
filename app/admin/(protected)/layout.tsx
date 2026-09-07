import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/auth";
import { AdminLogoutButton } from "./AdminLogoutButton";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/gallery", label: "Gallery" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) redirect("/admin/login");

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-cream-soft">
      <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-brown/10 bg-cream">
        <div className="p-5">
          <p className="text-xs tracking-[0.3em] uppercase text-brown-light">Dar Al Hay</p>
          <p className="font-heading text-lg text-brown-dark">Admin</p>
        </div>
        <nav className="flex md:flex-col overflow-x-auto md:overflow-visible px-3 pb-3 md:pb-0 gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap px-3 py-2 rounded-lg hover:bg-brown/10 text-brown-dark"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 hidden md:block">
          <AdminLogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-5 md:p-8">{children}</main>
    </div>
  );
}
