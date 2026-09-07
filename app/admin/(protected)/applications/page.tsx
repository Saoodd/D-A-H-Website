import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { runExpiryPass } from "@/lib/expiry";
import { getDisplayStatus } from "@/lib/status";
import { DISPLAY_STATUS } from "@/lib/constants";
import { ApplicationsListClient } from "./ApplicationsListClient";

export const metadata: Metadata = { title: "Applications — Admin" };

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  await runExpiryPass();

  const applications = await prisma.application.findMany({
    include: { event: true, payments: { where: { status: "SUCCEEDED" } } },
    orderBy: { createdAt: "desc" },
  });

  const withDisplay = applications.map((a) => ({
    id: a.id,
    businessName: a.businessName,
    email: a.email,
    eventName: a.event.name,
    createdAt: a.createdAt.toISOString(),
    acceptanceExpiresAt: a.acceptanceExpiresAt ? a.acceptanceExpiresAt.toISOString() : null,
    displayStatus: getDisplayStatus(a, a.payments.length > 0),
  }));

  const filtered = status && (DISPLAY_STATUS as readonly string[]).includes(status)
    ? withDisplay.filter((a) => a.displayStatus === status)
    : withDisplay;

  return <ApplicationsListClient applications={filtered} activeStatus={status || ""} />;
}
