import { redirect, notFound } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { getApplicationView } from "@/lib/applicationView";
import { ApplicationDetailClient } from "./ApplicationDetailClient";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const { id } = await params;
  const view = await getApplicationView(id, session.vendorId);
  if (!view) notFound();

  return <ApplicationDetailClient initialView={view} applicationId={id} />;
}
