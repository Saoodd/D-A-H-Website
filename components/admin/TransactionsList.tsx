"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { formatAed } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Card";

export interface TransactionRow {
  id: string;
  eventName?: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  boothCode: string;
  amountAedFils: number;
  status: string;
  provider: string;
  providerRef: string | null;
  createdAt: string;
  applicationId: string;
}

const statusTone: Record<string, "positive" | "attention" | "negative"> = {
  SUCCEEDED: "positive",
  PENDING: "attention",
  FAILED: "negative",
};

// Shared between the per-event Payments workspace and the All Transactions
// view — one responsive presentation so contact details never appear
// inconsistently between the two. Desktop keeps a compact table (core
// columns only) with a per-row expand toggle for email/phone/booth/
// provider/reference; below md it switches to stacked cards instead of an
// unusable wide horizontal scroll.
export function TransactionsList({ rows, showEventColumn }: { rows: TransactionRow[]; showEventColumn?: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <EmptyState title="No transactions match these filters" />;
  }

  return (
    <>
      {/* Desktop / tablet: compact table with expandable detail row */}
      <div className="hidden md:block overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-brown-light border-b border-brown/10">
              <th className="px-1 py-2 font-medium w-6" aria-hidden="true" />
              {showEventColumn && <th className="px-1 py-2 font-medium">Event</th>}
              <th className="px-1 py-2 font-medium">Business</th>
              <th className="px-1 py-2 font-medium">Contact</th>
              <th className="px-1 py-2 font-medium">Amount</th>
              <th className="px-1 py-2 font-medium">Status</th>
              <th className="px-1 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const expanded = expandedId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-brown/5 last:border-0">
                    <td className="px-1 py-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : t.id)}
                        aria-expanded={expanded}
                        aria-label={expanded ? "Hide details" : "Show details"}
                        className="text-brown-light hover:text-brown-dark w-5 h-5 flex items-center justify-center"
                      >
                        {expanded ? "−" : "+"}
                      </button>
                    </td>
                    {showEventColumn && <td className="px-1 py-3 text-brown-light">{t.eventName}</td>}
                    <td className="px-1 py-3 text-brown-dark font-medium">
                      <Link href={`/admin/applications/${t.applicationId}`} className="hover:underline">
                        {t.businessName}
                      </Link>
                    </td>
                    <td className="px-1 py-3 text-brown-dark">{t.contactName}</td>
                    <td className="px-1 py-3 text-brown-dark">{formatAed(t.amountAedFils)}</td>
                    <td className="px-1 py-3">
                      <StatusBadge label={t.status} tone={statusTone[t.status] ?? "neutral"} />
                    </td>
                    <td className="px-1 py-3 text-brown-light whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-brown/5 last:border-0">
                      <td colSpan={showEventColumn ? 7 : 6} className="px-1 pb-4">
                        <DetailGrid t={t} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards — never a forced wide horizontal table */}
      <div className="md:hidden space-y-3">
        {rows.map((t) => (
          <div key={t.id} className="rounded-[10px] border border-brown/10 bg-cream p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <Link href={`/admin/applications/${t.applicationId}`} className="font-medium text-brown-dark hover:underline">
                  {t.businessName}
                </Link>
                {showEventColumn && <p className="text-xs text-brown-light">{t.eventName}</p>}
              </div>
              <StatusBadge label={t.status} tone={statusTone[t.status] ?? "neutral"} />
            </div>
            <p className="text-brown-dark font-medium mb-2">{formatAed(t.amountAedFils)}</p>
            <DetailGrid t={t} />
          </div>
        ))}
      </div>
    </>
  );
}

function DetailGrid({ t }: { t: TransactionRow }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
      <DetailRow label="Contact">{t.contactName}</DetailRow>
      <DetailRow label="Booth">{t.boothCode}</DetailRow>
      <DetailRow label="Email">
        <a href={`mailto:${t.email}`} className="text-brown-dark underline underline-offset-2 hover:text-brown">
          {t.email}
        </a>
      </DetailRow>
      <DetailRow label="Phone">
        <a href={`tel:${t.phone}`} className="text-brown-dark underline underline-offset-2 hover:text-brown">
          {t.phone}
        </a>
      </DetailRow>
      <DetailRow label="Provider">{t.provider}</DetailRow>
      <DetailRow label="Reference">{t.providerRef ?? "—"}</DetailRow>
      {t.status === "SUCCEEDED" && (
        <DetailRow label="Receipt">
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href={`/admin/payments/receipts/${t.id}`} target="_blank" className="text-brown-dark underline underline-offset-2 hover:text-brown">
              View Receipt
            </Link>
            <Link href={`/admin/payments/receipts/${t.id}?mode=download`} target="_blank" className="text-brown-dark underline underline-offset-2 hover:text-brown">
              Download Receipt
            </Link>
          </span>
        </DetailRow>
      )}
    </dl>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-brown-light">{label}</dt>
      <dd className="text-brown-dark">{children}</dd>
    </div>
  );
}
