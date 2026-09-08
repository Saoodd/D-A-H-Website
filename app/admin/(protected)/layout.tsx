import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { AdminSidebar } from "./AdminSidebar";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) redirect("/admin/login");

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-cream-soft">
      <AdminSidebar />
      <main className="flex-1 p-5 md:p-8 min-w-0">{children}</main>
    </div>
  );
}
