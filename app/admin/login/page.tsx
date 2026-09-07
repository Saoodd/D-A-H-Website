import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { AdminLoginClient } from "./AdminLoginClient";

export const metadata: Metadata = { title: "Admin Login" };

export default async function AdminLoginPage() {
  const isAdmin = await getAdminSession();
  if (isAdmin) redirect("/admin");
  return <AdminLoginClient />;
}
