"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface RecordRow {
  id: string;
  businessName: string;
  contactName: string;
  username: string;
  representativeName: string | null;
  title: string;
  type: string;
  eventName: string | null;
  version: number;
  acceptedAt: string;
  boothCode: string | null;
}

/** Searchable, filterable, exportable list of signed agreement records.
 *  Pass `lockType` to scope this instance to one agreement type (hides the
 *  Type filter, since it would always be a no-op) — used by the Signup
 *  Terms page (VENDOR_TERMS only). Pass `eventId` to scope to one event's
 *  Event Terms records only — used by a per-event Agreements workspace, so
 *  its export never includes any other event or Signup Terms records. */
export function AgreementRecordsTable({ lockType, eventId }: { lockType?: "VENDOR_TERMS" | "EVENT_TERMS"; eventId?: string } = {}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState(lockType ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);

  function buildQuery() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (eventId) params.set("eventId", eventId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return params;
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/agreements/records?${buildQuery().toString()}`);
      const data = await res.json();
      setRows(data.rows || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load; re-runs when a filter commits (Search button / Enter)
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately not reactive to every keystroke; see the Search button
  }, []);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex flex-wrap items-end gap-3 mb-5"
      >
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Business / contact / username / event
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm w-64"
          />
        </label>
        {!lockType && (
          <label className="flex flex-col gap-1 text-xs text-brown-light">
            Type
            <select value={type} onChange={(e) => setType(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm">
              <option value="">All</option>
              <option value="VENDOR_TERMS">Account</option>
              <option value="EVENT_TERMS">Event</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm" />
        </label>
        <Button type="submit" size="sm">
          Search
        </Button>
        <a
          href={`/api/admin/agreements/records?${buildQuery().toString()}&format=csv`}
          className="px-4 py-2 rounded-full border border-brown/30 text-sm hover:bg-brown/5"
        >
          Export CSV
        </a>
        <a
          href={`/api/admin/agreements/records?${buildQuery().toString()}&format=xlsx`}
          className="px-4 py-2 rounded-full border border-brown/30 text-sm hover:bg-brown/5"
        >
          Export Excel
        </a>
      </form>

      {loading ? (
        <p className="text-sm text-brown-light">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No agreements match these filters" />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/admin/agreements/records/${r.id}`}
              className="flex items-center justify-between flex-wrap gap-3 rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-4 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-brown-dark">
                  {r.businessName}
                  {r.eventName ? ` — ${r.eventName}` : ""}
                </p>
                <p className="text-xs text-brown-light">
                  {r.contactName}
                  {r.username ? ` · @${r.username}` : ""}
                  {r.representativeName ? ` · Rep: ${r.representativeName}` : ""} · v{r.version} ·{" "}
                  {new Date(r.acceptedAt).toLocaleDateString()}
                  {r.boothCode ? ` · Booth ${r.boothCode}` : ""}
                </p>
              </div>
              <StatusBadge label={r.type === "VENDOR_TERMS" ? "Account" : "Event"} tone="neutral" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
