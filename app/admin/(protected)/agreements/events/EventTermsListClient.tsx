"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Card";

interface EventRow {
  eventId: string;
  eventName: string;
  startDate: string;
  location: string;
  eventStatus: string;
  publishedVersion: number | null;
  hasDraft: boolean;
  relevantCount: number;
  signedCount: number;
}

type TimeFilter = "all" | "upcoming" | "past";
type SortOrder = "newest" | "oldest";

function termsBadge(row: EventRow): { label: string; tone: "positive" | "attention" | "neutral" } {
  if (row.publishedVersion !== null) return { label: `Published v${row.publishedVersion}`, tone: "positive" };
  if (row.hasDraft) return { label: "Draft only", tone: "attention" };
  return { label: "Not Configured", tone: "neutral" };
}

export function EventTermsListClient({ events }: { events: EventRow[] }) {
  const [q, setQ] = useState("");
  const [time, setTime] = useState<TimeFilter>("all");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [unsignedOnly, setUnsignedOnly] = useState(false);
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    let rows = events.filter((e) => e.eventName.toLowerCase().includes(q.trim().toLowerCase()));
    if (time === "upcoming") rows = rows.filter((e) => new Date(e.startDate).getTime() >= now);
    if (time === "past") rows = rows.filter((e) => new Date(e.startDate).getTime() < now);
    if (unsignedOnly) rows = rows.filter((e) => e.relevantCount > e.signedCount);
    rows = [...rows].sort((a, b) => {
      const diff = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      return sort === "newest" ? -diff : diff;
    });
    return rows;
  }, [events, q, time, sort, unsignedOnly, now]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Search event
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Event name…"
            className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Timing
          <select value={time} onChange={(e) => setTime(e.target.value as TimeFilter)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm">
            <option value="all">All</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortOrder)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-brown-dark pb-2">
          <input type="checkbox" checked={unsignedOnly} onChange={(e) => setUnsignedOnly(e.target.checked)} className="accent-brown" />
          Events with unsigned vendors
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No events match these filters" />
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const badge = termsBadge(row);
            const pct = row.relevantCount > 0 ? Math.round((row.signedCount / row.relevantCount) * 100) : null;
            return (
              <Link
                key={row.eventId}
                href={`/admin/agreements/events/${row.eventId}`}
                className="block rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-5 transition-colors"
              >
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-heading text-lg text-brown-dark">{row.eventName}</p>
                    <p className="text-xs text-brown-light mt-0.5">
                      {new Date(row.startDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                      {row.location ? ` · ${row.location}` : ""}
                    </p>
                  </div>
                  <StatusBadge label={badge.label} tone={badge.tone} />
                </div>

                <div className="mt-4 flex items-center gap-4">
                  <p className="text-sm text-brown-dark whitespace-nowrap">
                    {row.signedCount} / {row.relevantCount} signed
                  </p>
                  <div className="flex-1 h-1.5 rounded-full bg-brown/10 overflow-hidden">
                    <div
                      className="h-full bg-brown/60 rounded-full"
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-brown-light w-10 text-right">{pct === null ? "—" : `${pct}%`}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
