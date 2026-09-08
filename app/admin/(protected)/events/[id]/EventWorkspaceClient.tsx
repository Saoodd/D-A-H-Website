"use client";

import { useState } from "react";
import Link from "next/link";
import { formatAed, DisplayStatus } from "@/lib/constants";
import { MetricCard, EmptyState } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EventForm } from "../EventForm";
import { FloorPlanBuilder } from "./FloorPlanBuilder";
import { EventDangerZone } from "./EventDangerZone";

type Tab = "overview" | "applications" | "floorplan" | "vendors" | "payments" | "settings";

interface AppRow {
  id: string;
  businessName: string;
  vendorId: string;
  displayStatus: DisplayStatus;
  createdAt: string;
}

interface VendorRow {
  id: string;
  businessName: string;
  verified: boolean;
}

interface PaymentRow {
  id: string;
  businessName: string;
  applicationId: string;
  boothCode: string;
  amountAedFils: number;
  paidAt: string | null;
}

const displayStatusTone: Record<DisplayStatus, "neutral" | "positive" | "attention" | "negative"> = {
  PENDING: "neutral",
  REJECTED: "negative",
  ACCEPTED_UNPAID: "attention",
  PAID: "positive",
  EXPIRED: "neutral",
};

export function EventWorkspaceClient({
  event,
  stats,
  applications,
  vendors,
  payments,
  eventFormProps,
  floorPlanProps,
}: {
  event: { id: string; name: string; status: string };
  stats: {
    applicationsCount: number;
    pending: number;
    accepted: number;
    rejected: number;
    boothsSold: number;
    boothsTotal: number;
    revenue: number;
    vendorsCount: number;
  };
  applications: AppRow[];
  vendors: VendorRow[];
  payments: PaymentRow[];
  eventFormProps: React.ComponentProps<typeof EventForm>;
  floorPlanProps: React.ComponentProps<typeof FloorPlanBuilder>;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "applications", label: "Applications", count: stats.applicationsCount },
    { key: "floorplan", label: "Floor Plan & Booths" },
    { key: "vendors", label: "Vendors", count: stats.vendorsCount },
    { key: "payments", label: "Payments", count: payments.length },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <Link href="/admin/events" className="text-sm text-brown-light underline">
          &larr; Events
        </Link>
      </div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="font-heading text-2xl text-brown-dark">{event.name}</h1>
        <StatusBadge label={event.status} tone={event.status === "PUBLISHED" ? "positive" : "neutral"} />
      </div>

      <div className="flex gap-1 overflow-x-auto mb-8 border-b border-brown/10">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`shrink-0 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
              tab === tb.key ? "border-brown text-brown-dark font-medium" : "border-transparent text-brown-light hover:text-brown-dark"
            }`}
          >
            {tb.label}
            {tb.count != null && tb.count > 0 && <span className="ms-1.5 text-xs text-brown-light">{tb.count}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="max-w-3xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Applications" value={stats.applicationsCount} hint={`${stats.pending} pending`} />
            <MetricCard label="Booths sold" value={`${stats.boothsSold} / ${stats.boothsTotal}`} />
            <MetricCard label="Revenue" value={formatAed(stats.revenue)} />
            <MetricCard label="Vendors" value={stats.vendorsCount} />
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-[10px] border border-brown/10 bg-cream p-4">
              <p className="text-brown-light text-xs">Pending</p>
              <p className="font-heading text-xl text-brown-dark mt-1">{stats.pending}</p>
            </div>
            <div className="rounded-[10px] border border-brown/10 bg-cream p-4">
              <p className="text-brown-light text-xs">Accepted</p>
              <p className="font-heading text-xl text-brown-dark mt-1">{stats.accepted}</p>
            </div>
            <div className="rounded-[10px] border border-brown/10 bg-cream p-4">
              <p className="text-brown-light text-xs">Rejected</p>
              <p className="font-heading text-xl text-brown-dark mt-1">{stats.rejected}</p>
            </div>
          </div>
        </div>
      )}

      {tab === "applications" && (
        <div className="max-w-3xl">
          {applications.length === 0 ? (
            <EmptyState title="No applications yet" />
          ) : (
            <div className="space-y-2">
              {applications.map((a) => (
                <Link
                  key={a.id}
                  href={`/admin/applications/${a.id}`}
                  className="flex items-center justify-between flex-wrap gap-3 rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-4 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-brown-dark">{a.businessName}</p>
                    <p className="text-xs text-brown-light">{new Date(a.createdAt).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge label={a.displayStatus.replace("_", " ")} tone={displayStatusTone[a.displayStatus]} />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "floorplan" && (
        <FloorPlanBuilder
          eventId={floorPlanProps.eventId}
          floorPlanImageUrl={floorPlanProps.floorPlanImageUrl}
          venueWidthM={floorPlanProps.venueWidthM}
          tiers={floorPlanProps.tiers}
        />
      )}

      {tab === "vendors" && (
        <div className="max-w-3xl">
          {vendors.length === 0 ? (
            <EmptyState title="No vendors have applied yet" />
          ) : (
            <div className="space-y-2">
              {vendors.map((v) => (
                <Link
                  key={v.id}
                  href={`/admin/vendors/${v.id}`}
                  className="flex items-center justify-between rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-4 transition-colors"
                >
                  <p className="text-sm font-medium text-brown-dark">{v.businessName}</p>
                  <StatusBadge label={v.verified ? "Verified" : "Unverified"} tone={v.verified ? "positive" : "attention"} />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "payments" && (
        <div className="max-w-3xl">
          {payments.length === 0 ? (
            <EmptyState title="No payments yet" />
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/applications/${p.applicationId}`}
                  className="flex items-center justify-between flex-wrap gap-3 rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-4 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-brown-dark">{p.businessName}</p>
                    <p className="text-xs text-brown-light">
                      Booth {p.boothCode}
                      {p.paidAt ? ` · ${new Date(p.paidAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <p className="text-sm text-brown font-medium">{formatAed(p.amountAedFils)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="max-w-4xl">
          <EventForm existingEvents={eventFormProps.existingEvents} initial={eventFormProps.initial} />
          <EventDangerZone eventId={event.id} eventName={event.name} />
        </div>
      )}
    </div>
  );
}
