"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface CommunicationSummary {
  id: string;
  internalName: string;
  sentByName: string | null;
  channel: string;
  eventNames: string | null;
  audienceSummary: string;
  emailSubject: string | null;
  whatsappTemplateName: string | null;
  status: string;
  totalRecipients: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface Recipient {
  id: string;
  businessNameSnapshot: string;
  contactNameSnapshot: string;
  channel: string;
  destination: string | null;
  status: string;
  skipReason: string | null;
  boothCodesSnapshot: string | null;
  applicationStatusSnapshot: string | null;
  queuedAt: string;
  processedAt: string | null;
}

interface Stats {
  email: { queued: number; sent: number; delivered: number; failed: number; skipped: number };
  whatsapp: { queued: number; sent: number; delivered: number; failed: number; skipped: number };
}

const STATUS_TONE: Record<string, "neutral" | "attention" | "positive" | "negative"> = {
  DRAFT: "neutral",
  SENDING: "attention",
  COMPLETED: "positive",
  PARTIALLY_FAILED: "attention",
  FAILED: "negative",
  QUEUED: "neutral",
  PROCESSING: "attention",
  SENT: "neutral",
  DELIVERED: "positive",
  SKIPPED: "neutral",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-AE", { day: "numeric", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString("en-AE", { hour: "numeric", minute: "2-digit" });
}

export function CommunicationDetailClient({ communication }: { communication: CommunicationSummary }) {
  const [status, setStatus] = useState(communication.status);
  const [totalRecipients, setTotalRecipients] = useState(communication.totalRecipients);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [channelFilter, setChannelFilter] = useState<"" | "EMAIL" | "WHATSAPP">("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (channelFilter) params.set("channel", channelFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/communications/${communication.id}?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setStatus(data.communication.status);
        setTotalRecipients(data.communication.totalRecipients);
        setRecipients(data.recipients);
        setStats(data.stats);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches fresh recipient/stats data whenever the filter changes, not derived render state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter, statusFilter]);

  const totalFailed = (stats?.email.failed || 0) + (stats?.whatsapp.failed || 0);

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/admin/communications/${communication.id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error || "Nothing to retry.");
        return;
      }
      setNotice("Retry complete.");
      load();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xl text-brown-dark">{communication.internalName}</p>
            <p className="text-sm text-brown-light mt-1">
              {communication.eventNames || "All Events"} · {communication.channel === "BOTH" ? "Email + WhatsApp" : communication.channel === "EMAIL" ? "Email" : "WhatsApp"}
            </p>
            <p className="text-sm text-brown-light mt-0.5">{communication.audienceSummary}</p>
          </div>
          <StatusBadge label={status.replace("_", " ")} tone={STATUS_TONE[status] || "neutral"} />
        </div>
        <dl className="grid sm:grid-cols-2 gap-3 mt-5 text-sm">
          <div>
            <dt className="text-brown-light text-xs">Created by</dt>
            <dd className="text-brown-dark">{communication.sentByName || "Admin"}</dd>
          </div>
          <div>
            <dt className="text-brown-light text-xs">Created</dt>
            <dd className="text-brown-dark">{fmt(communication.createdAt)}</dd>
          </div>
          {communication.emailSubject && (
            <div>
              <dt className="text-brown-light text-xs">Email subject</dt>
              <dd className="text-brown-dark">{communication.emailSubject}</dd>
            </div>
          )}
          {communication.whatsappTemplateName && (
            <div>
              <dt className="text-brown-light text-xs">WhatsApp template</dt>
              <dd className="text-brown-dark">{communication.whatsappTemplateName}</dd>
            </div>
          )}
          <div>
            <dt className="text-brown-light text-xs">Recipients</dt>
            <dd className="text-brown-dark">{totalRecipients}</dd>
          </div>
          <div>
            <dt className="text-brown-light text-xs">Completed</dt>
            <dd className="text-brown-dark">{fmt(communication.completedAt)}</dd>
          </div>
        </dl>
      </Card>

      {stats && (
        <div className="grid sm:grid-cols-2 gap-4">
          {(communication.channel === "EMAIL" || communication.channel === "BOTH") && (
            <Card className="p-4">
              <p className="label-caps mb-2">Email</p>
              <p className="text-sm text-brown-dark">
                {stats.email.sent + stats.email.delivered} sent · {stats.email.delivered} delivered · {stats.email.failed} failed · {stats.email.skipped} skipped
              </p>
            </Card>
          )}
          {(communication.channel === "WHATSAPP" || communication.channel === "BOTH") && (
            <Card className="p-4">
              <p className="label-caps mb-2">WhatsApp</p>
              <p className="text-sm text-brown-dark">
                {stats.whatsapp.sent + stats.whatsapp.delivered} sent · {stats.whatsapp.delivered} delivered · {stats.whatsapp.failed} failed · {stats.whatsapp.skipped} skipped
              </p>
            </Card>
          )}
        </div>
      )}

      {notice && <p className="text-sm text-brown-dark bg-brown/10 rounded-[8px] px-4 py-2">{notice}</p>}

      {totalFailed > 0 && (
        <div className="flex items-center justify-between bg-amber-500/10 rounded-[8px] px-4 py-3">
          <p className="text-sm text-amber-800">{totalFailed} recipient{totalFailed === 1 ? "" : "s"} failed.</p>
          <Button size="sm" onClick={handleRetry} loading={retrying}>
            Retry {totalFailed} Failed
          </Button>
        </div>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as "" | "EMAIL" | "WHATSAPP")} className="text-sm border border-brown/20 rounded-[6px] px-2 py-1.5">
            <option value="">All Channels</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm border border-brown/20 rounded-[6px] px-2 py-1.5">
            <option value="">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="FAILED">Failed</option>
            <option value="SKIPPED">Skipped</option>
            <option value="QUEUED">Queued</option>
          </select>
          {loading && <span className="text-xs text-brown-light">Loading…</span>}
        </div>
        <div className="border border-brown/10 rounded-[8px] divide-y divide-brown/10 overflow-x-auto">
          {recipients.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-brown-light">No recipients match this filter.</p>
          ) : (
            recipients.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="text-brown-dark font-medium">{r.businessNameSnapshot}</p>
                  <p className="text-xs text-brown-light">
                    {r.channel} · {r.destination}
                    {r.boothCodesSnapshot && ` · ${r.boothCodesSnapshot}`}
                    {r.skipReason && ` · ${r.skipReason}`}
                  </p>
                </div>
                <StatusBadge label={r.status} tone={STATUS_TONE[r.status] || "neutral"} />
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
