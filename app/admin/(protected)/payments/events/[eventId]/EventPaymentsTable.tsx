"use client";

import { useMemo, useState } from "react";
import { TransactionsList, type TransactionRow } from "@/components/admin/TransactionsList";
import { PAYMENT_FILTER_STATUSES, matchesPaymentFilters, parsePaymentFilters, paymentFiltersToQuery } from "@/lib/paymentFilters";

export function EventPaymentsTable({ eventId, eventName, transactions }: { eventId: string; eventName: string; transactions: TransactionRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filters = parsePaymentFilters({ q, status, dateFrom, dateTo });
  const filtered = useMemo(
    () => transactions.filter((t) => matchesPaymentFilters(t, filters)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is derived from these four inputs
    [transactions, q, status, dateFrom, dateTo],
  );

  function exportParams(format: "csv" | "xlsx") {
    const params = paymentFiltersToQuery({ ...filters, eventId });
    params.set("format", format);
    return params.toString();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Business / contact / email / receipt
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
            {PAYMENT_FILTER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
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
