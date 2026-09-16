import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CommunicationDetailClient } from "./CommunicationDetailClient";

export default async function CommunicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const communication = await prisma.communication.findUnique({ where: { id } });
  if (!communication) notFound();

  return (
    <CommunicationDetailClient
      communication={{
        id: communication.id,
        internalName: communication.internalName,
        sentByName: communication.sentByName,
        channel: communication.channel,
        eventNames: communication.eventNames,
        audienceSummary: communication.audienceSummary,
        emailSubject: communication.emailSubject,
        whatsappTemplateName: communication.whatsappTemplateName,
        status: communication.status,
        totalRecipients: communication.totalRecipients,
        createdAt: communication.createdAt.toISOString(),
        startedAt: communication.startedAt ? communication.startedAt.toISOString() : null,
        completedAt: communication.completedAt ? communication.completedAt.toISOString() : null,
      }}
    />
  );
}
