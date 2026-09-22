"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatAed, formatBoothCodes } from "@/lib/constants";

interface Application {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  category: string;
  instagram: string | null;
  vendorDescription: string;
  vendorVerified: boolean;
  status: string;
  displayStatus: string;
  acceptedAt: string | null;
  acceptanceExpiresAt: string | null;
  acceptanceHoursUsed: number | null;
  rejectedAt: string | null;
  expiredAt: string | null;
  eventName: string;
  eventId: string;
  heldBooths: string[];
  soldBooths: { code: string; priceAedFilsAtSale: number | null }[];
  adjustments: { id: string; amountAedFils: number; reason: string; createdAt: string }[];
  payments: { id: string; amountAedFils: number; status: string; provider: string; createdAt: string; paidAt: string | null }[];
  cancellationRequests: { id: string; reason: string; status: string; createdAt: string }[];
}

export function ApplicationDetailAdminClient({ application: a }: { application: Application }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busy = busyAction !== null;
  const [extendHours, setExtendHours] = useState("3");
  const [overrideHours, setOverrideHours] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function call(action: string, path: string, body?: unknown) {
    setBusyAction(action);
    setNotice(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      router.refresh();
      return data;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <Link href="/admin/applications" className="text-sm text-brown-light underline">
        &larr; Applications
      </Link>

      <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-2xl text-brown-dark">{a.businessName}</h1>
        <span className="text-xs px-3 py-1 rounded-full bg-cream-deep text-brown-dark">
          {a.displayStatus.replace("_", " ")}
        </span>
      </div>
      <p className="text-sm text-brown-light">{a.eventName}</p>

      {notice && (
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
          {notice}
        </div>
      )}

      <section className="mt-6 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-cream rounded-xl border border-brown/10 p-5">
        <Row label="Contact name" value={a.contactName} />
        <Row label="Email" value={a.email} />
        <Row label="Phone" value={a.phone} />
        <Row label="Category" value={a.category} />
        <Row label="Instagram / social" value={a.instagram || "—"} />
        <Row label="Business verified" value={a.vendorVerified ? "Yes" : "No — see Admin → Vendors"} />
        <Row label="Business description" value={a.vendorDescription || "—"} full />
      </section>

      <section className="mt-6 flex flex-wrap gap-3">
        {(a.status === "PENDING") && (
          <>
            <button disabled={busy} onClick={() => call("approve", `/api/admin/applications/${a.id}/approve`)} className="px-4 py-2 rounded-full bg-green-700 text-white text-sm disabled:opacity-50">
              {busyAction === "approve" ? "Approving…" : "Approve"}
            </button>
            <button disabled={busy} onClick={() => call("reject", `/api/admin/applications/${a.id}/reject`)} className="px-4 py-2 rounded-full bg-red-700 text-white text-sm disabled:opacity-50">
              {busyAction === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </>
        )}
        {(a.status === "REJECTED" || a.status === "ACCEPTANCE_EXPIRED") && (
          <div className="flex items-end gap-2">
            <label className="text-xs text-brown-light flex flex-col gap-1">
              Deadline hours (optional override)
              <input
                value={overrideHours}
                onChange={(e) => setOverrideHours(e.target.value)}
                placeholder="default"
                className="border border-brown/20 rounded-lg px-2 py-1.5 w-28 bg-cream-soft"
              />
            </label>
            <button
              disabled={busy}
              onClick={() =>
                call("reaccept", `/api/admin/applications/${a.id}/approve`, {
                  deadlineHoursOverride: overrideHours ? Number(overrideHours) : undefined,
                })
              }
              className="px-4 py-2 rounded-full bg-green-700 text-white text-sm disabled:opacity-50"
            >
              {busyAction === "reaccept" ? "Re-accepting…" : "Re-accept"}
            </button>
          </div>
        )}
        {a.status === "ACCEPTED" && (
          <>
            <button disabled={busy} onClick={() => call("resend", `/api/admin/applications/${a.id}/resend`)} className="px-4 py-2 rounded-full border border-brown/30 text-sm disabled:opacity-50">
              {busyAction === "resend" ? "Sending…" : "Resend approval email"}
            </button>
            <div className="flex items-end gap-2">
              <label className="text-xs text-brown-light flex flex-col gap-1">
                Extend by (hours)
                <input
                  value={extendHours}
                  onChange={(e) => setExtendHours(e.target.value)}
                  className="border border-brown/20 rounded-lg px-2 py-1.5 w-24 bg-cream-soft"
                />
              </label>
              <button
                disabled={busy}
                onClick={() => call("extend", `/api/admin/applications/${a.id}/extend`, { hours: Number(extendHours) })}
                className="px-4 py-2 rounded-full border border-brown/30 text-sm disabled:opacity-50"
              >
                {busyAction === "extend" ? "Extending…" : "Extend"}
              </button>
            </div>
            <button disabled={busy} onClick={() => call("revoke", `/api/admin/applications/${a.id}/revoke`)} className="px-4 py-2 rounded-full bg-red-700 text-white text-sm disabled:opacity-50">
              {busyAction === "revoke" ? "Revoking…" : "Revoke acceptance"}
            </button>
          </>
        )}
      </section>

      <section className="mt-8 text-sm bg-cream-soft border border-brown/10 rounded-xl p-5">
        <p className="text-xs uppercase tracking-widest text-brown-light mb-3">Acceptance timeline</p>
        <Row label="Accepted at" value={a.acceptedAt ? new Date(a.acceptedAt).toLocaleString() : "—"} />
        <Row label="Payment deadline" value={a.acceptanceExpiresAt ? new Date(a.acceptanceExpiresAt).toLocaleString() : "—"} />
        <Row label="Hours granted" value={a.acceptanceHoursUsed != null ? String(a.acceptanceHoursUsed) : "—"} />
        <Row label="Rejected at" value={a.rejectedAt ? new Date(a.rejectedAt).toLocaleString() : "—"} />
        <Row label="Expired at" value={a.expiredAt ? new Date(a.expiredAt).toLocaleString() : "—"} />
        <Row label="Booth(s) held/selecting" value={formatBoothCodes(a.heldBooths)} />
        <Row
          label="Booth(s) sold"
          value={
            a.soldBooths.length
              ? a.soldBooths.map((b) => `${b.code}${b.priceAedFilsAtSale != null ? ` (${formatAed(b.priceAedFilsAtSale)})` : ""}`).join(" + ")
              : "—"
          }
        />
      </section>

      <section className="mt-8">
        <p className="text-xs uppercase tracking-widest text-brown-light mb-3">Payments</p>
        <div className="space-y-2 text-sm">
          {a.payments.length === 0 && <p className="text-brown-light">No payment attempts yet.</p>}
          {a.payments.map((p) => (
            <div key={p.id} className="flex justify-between border-b border-brown/10 pb-2">
              <span>{p.provider} · {new Date(p.createdAt).toLocaleString()}</span>
              <span>{formatAed(p.amountAedFils)} — {p.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <p className="text-xs uppercase tracking-widest text-brown-light mb-3">Adjustments</p>
        <div className="space-y-2 text-sm mb-4">
          {a.adjustments.length === 0 && <p className="text-brown-light">No manual adjustments.</p>}
          {a.adjustments.map((adj) => (
            <div key={adj.id} className="flex justify-between border-b border-brown/10 pb-2">
              <span>{adj.reason}</span>
              <span>{formatAed(adj.amountAedFils)}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-brown-light flex flex-col gap-1">
            Amount (AED)
            <input value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} className="border border-brown/20 rounded-lg px-2 py-1.5 w-28 bg-cream-soft" />
          </label>
          <label className="text-xs text-brown-light flex flex-col gap-1 flex-1 min-w-[200px]">
            Reason (required)
            <input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} className="border border-brown/20 rounded-lg px-2 py-1.5 bg-cream-soft" />
          </label>
          <button
            disabled={busy || !adjAmount || !adjReason}
            onClick={async () => {
              await call("adjustment", `/api/admin/applications/${a.id}/adjustments`, {
                amountAedFils: Math.round(Number(adjAmount) * 100),
                reason: adjReason,
              });
              setAdjAmount("");
              setAdjReason("");
            }}
            className="px-4 py-2 rounded-full bg-brown text-cream-soft text-sm disabled:opacity-50"
          >
            {busyAction === "adjustment" ? "Adding…" : "Add adjustment"}
          </button>
        </div>
      </section>

      {a.cancellationRequests.length > 0 && (
        <section className="mt-8">
          <p className="text-xs uppercase tracking-widest text-brown-light mb-3">Cancellation requests</p>
          <div className="space-y-2 text-sm">
            {a.cancellationRequests.map((c) => (
              <div key={c.id} className="flex justify-between border-b border-brown/10 pb-2">
                <span>{c.reason} — {new Date(c.createdAt).toLocaleString()}</span>
                <span>{c.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2 py-1" : "py-1"}>
      <span className="text-brown-light">{label}: </span>
      <span className="text-brown-dark">{value}</span>
    </div>
  );
}
