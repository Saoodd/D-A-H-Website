"use client";

import { useMemo, useState } from "react";
import { TransactionsList, type TransactionRow } from "@/components/admin/TransactionsList";

export function EventPaymentsTable({ eventId, eventName, transactions }: { eventId: string; eventName: string; transactions: TransactionRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return transactions.filter((t) => {
      if (
        needle &&
        !t.businessName.toLowerCase().includes(needle) &&
        !t.contactName.toLowerCase().includes(needle) &&
        !t.email.toLowerCase().includes(needle)
      )
        return false;
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
          Business / contact / email
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

      <TransactionsList rows={filtered} />
    </div>
  );
}
