"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";

interface DeliveryRow {
  id: string;
  type: string;
  toEmail: string;
  vendorBusinessName: string | null;
  status: string;
  failReason: string | null;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  retryable: boolean;
}

const statusTone: Record<string, "neutral" | "positive" | "attention" | "negative" | "info"> = {
  QUEUED: "neutral",
  SENT: "info",
  DELIVERED: "positive",
  BOUNCED: "negative",
  FAILED: "negative",
};

export function EmailsAdminClient({ deliveries: initial }: { deliveries: DeliveryRow[] }) {
  const [deliveries, setDeliveries] = useState(initial);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function retry(id: string) {
    setRetryingId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/email-deliveries/${id}/retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error || "Retry failed.");
        return;
      }
      // The retry sends a brand-new delivery row — mark this old one so the
      // admin can see it was actioned, without needing a full page reload.
      setDeliveries((rows) => rows.map((r) => (r.id === id ? { ...r, retryable: false, failReason: `${r.failReason ?? ""} (retried)`.trim() } : r)));
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {notice && <p className="text-sm text-red-700 dark:text-red-400">{notice}</p>}
      <div className="rounded-[10px] border border-brown/10 bg-cream overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-brown-light border-b border-brown/10">
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">To</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Queued</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {deliveries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-brown-light">
                  No emails sent yet.
                </td>
              </tr>
            ) : (
              deliveries.map((d) => (
                <tr key={d.id} className="border-b border-brown/5 last:border-0 align-top">
                  <td className="px-4 py-3 font-mono text-xs text-brown-dark">{d.type}</td>
                  <td className="px-4 py-3 text-brown-dark">{d.toEmail}</td>
                  <td className="px-4 py-3 text-brown-light">{d.vendorBusinessName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={d.status} tone={statusTone[d.status] ?? "neutral"} />
                    {d.failReason && <p className="text-xs text-brown-light mt-1 max-w-xs truncate" title={d.failReason}>{d.failReason}</p>}
                  </td>
                  <td className="px-4 py-3 text-brown-light text-xs">{new Date(d.queuedAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {d.retryable && (
                      <Button size="sm" variant="secondary" loading={retryingId === d.id} onClick={() => retry(d.id)}>
                        Retry
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
