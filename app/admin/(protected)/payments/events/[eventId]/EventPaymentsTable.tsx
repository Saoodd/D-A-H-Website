"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatAed } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Card";

interface Transaction {
  id: string;
  businessName: string;
  contactName: string;
  boothCode: string;
  amountAedFils: number;
  status: string;
  provider: string;
  providerRef: string | null;
  createdAt: string;
  paidAt: string | null;
  applicationId: string;
}

const statusTone: Record<string, "positive" | "attention" | "negative"> = {
  SUCCEEDED: "positive",
  PENDING: "attention",
  FAILED: "negative",
};

export function EventPaymentsTable({ eventId, eventName, transactions }: { eventId: string; eventName: string; transactions: Transaction[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return transactions.filter((t) => {
      if (needle && !t.businessName.toLowerCase().includes(needle) && !t.contactName.toLowerCase().includes(needle)) return false;
      if (status && t.status !== status) return false;
      if (dateFrom && new Date(t.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(t.createdAt) > new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000)) return false;
      return true;
    });
  }, [transactions, q, status, dateFrom, dateTo]);

  function exportParams(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ eventId, format });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params.toString();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Business / contact
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm">
            <option value="">All</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm" />
        </label>
        <a href={`/api/admin/payments/export?${exportParams("csv")}`} className="px-4 py-2 rounded-full border border-brown/30 text-sm hover:bg-brown/5">
          Export CSV
        </a>
        <a href={`/api/admin/payments/export?${exportParams("xlsx")}`} className="px-4 py-2 rounded-full border border-brown/30 text-sm hover:bg-brown/5">
          Export Excel
        </a>
      </div>
      <p className="text-xs text-brown-light mb-3">{eventName} Payments Export — this file contains only {eventName}&rsquo;s transactions.</p>

      {filtered.length === 0 ? (
        <EmptyState title="No transactions match these filters" />
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-xs text-brown-light border-b border-brown/10">
                <th className="px-1 py-2 font-medium">Business</th>
                <th className="px-1 py-2 font-medium">Contact</th>
                <th className="px-1 py-2 font-medium">Booth</th>
                <th className="px-1 py-2 font-medium">Amount</th>
                <th className="px-1 py-2 font-medium">Status</th>
                <th className="px-1 py-2 font-medium">Provider</th>
                <th className="px-1 py-2 font-medium">Reference</th>
                <th className="px-1 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-brown/5 last:border-0">
                  <td className="px-1 py-3 text-brown-dark font-medium">
                    <Link href={`/admin/applications/${t.applicationId}`} className="hover:underline">
                      {t.businessName}
                    </Link>
                  </td>
                  <td className="px-1 py-3 text-brown-dark">{t.contactName}</td>
                  <td className="px-1 py-3 text-brown-light">{t.boothCode}</td>
                  <td className="px-1 py-3 text-brown-dark">{formatAed(t.amountAedFils)}</td>
                  <td className="px-1 py-3">
                    <StatusBadge label={t.status} tone={statusTone[t.status] ?? "neutral"} />
                  </td>
                  <td className="px-1 py-3 text-brown-light">{t.provider}</td>
                  <td className="px-1 py-3 text-brown-light">{t.providerRef ?? "—"}</td>
                  <td className="px-1 py-3 text-brown-light whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
