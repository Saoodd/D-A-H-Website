import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

const STATUS_TONE: Record<string, "neutral" | "attention" | "positive" | "negative"> = {
  DRAFT: "neutral",
  SENDING: "attention",
  COMPLETED: "positive",
  PARTIALLY_FAILED: "attention",
  FAILED: "negative",
};

function fmt(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString("en-AE", { hour: "numeric", minute: "2-digit" });
}

export default async function CommunicationsHistoryPage() {
  const communications = await prisma.communication.findMany({
    where: { isTest: false },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  if (communications.length === 0) {
    return (
      <EmptyState
        title="No communications sent yet"
        description="Compose your first message to a group of vendors — filter by event, application status, payment status, booth, or select vendors manually."
        action={<LinkButton href="/admin/communications/new">New Message</LinkButton>}
      />
    );
  }

  return (
    <div className="space-y-3">
      {communications.map((c) => (
        <Link
          key={c.id}
          href={`/admin/communications/${c.id}`}
          className="block rounded-[10px] border border-brown/10 bg-cream px-5 py-4 hover:border-brown/25 transition-colors"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-heading text-base text-brown-dark truncate">{c.internalName}</p>
              <p className="text-xs text-brown-light mt-1">
                {c.eventNames || "All Events"} · {c.channel === "BOTH" ? "Email + WhatsApp" : c.channel === "EMAIL" ? "Email" : "WhatsApp"}
              </p>
              <p className="text-xs text-brown-light mt-0.5">{c.audienceSummary}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <StatusBadge label={c.status.replace("_", " ")} tone={STATUS_TONE[c.status] || "neutral"} />
              <span className="text-xs text-brown-light">{c.totalRecipients} recipient{c.totalRecipients === 1 ? "" : "s"}</span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-brown-light">
            <span>Created by {c.sentByName || "Admin"}</span>
            <span>{fmt(c.createdAt)}</span>
            {c.completedAt && <span>Completed {fmt(c.completedAt)}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
