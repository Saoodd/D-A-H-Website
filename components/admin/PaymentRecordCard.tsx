"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatAed } from "@/lib/constants";
import { LIFECYCLE_LABEL, type LifecycleStatus } from "@/lib/paymentLifecycle";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface AdminPaymentRecord {
  id: string;
  amountAedFils: number;
  status: string;
  provider: string;
  methodLabel: string;
  reference: string | null;
  note: string | null;
  receiptNumber: string | null;
  lifecycle: LifecycleStatus;
  refundedAedFils: number;
  needsAttention: string | null;
  providerRefundable: boolean;
  refunds: { id: string; amountAedFils: number; method: string; reason: string; reference: string | null; createdAt: string }[];
  events: { id: string; type: string; actor: string; createdAt: string }[];
  createdAt: string;
  paidAt: string | null;
}

const tone: Record<LifecycleStatus, "positive" | "attention" | "negative" | "neutral"> = {
  CREATED: "neutral",
  PENDING: "attention",
  AUTHORIZED: "attention",
  PAID: "positive",
  FAILED: "negative",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "attention",
};

const REFUND_METHOD_LABEL: Record<string, string> = {
  ORIGINAL_METHOD: "Through the payment provider",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  OTHER: "Other",
};

/** One payment on the admin application page: lifecycle state, refunds,
 *  anything flagged for attention, and its full audit history. */
export function PaymentRecordCard({ p }: { p: AdminPaymentRecord }) {
  const router = useRouter();
  const [refunding, setRefunding] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(p.providerRefundable ? "ORIGINAL_METHOD" : "BANK_TRANSFER");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const refundable = p.status === "SUCCEEDED" ? p.amountAedFils - p.refundedAedFils : 0;

  async function post(key: string, path: string, body: unknown) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      setRefunding(false);
      setAmount("");
      setReason("");
      setReference("");
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  function submitRefund() {
    const fils = Math.round(Number(amount) * 100);
    if (!fils || fils <= 0) return setError("Enter the amount refunded, in AED.");
    if (fils > refundable) return setError(`At most ${formatAed(refundable)} can be refunded.`);
    if (!window.confirm(`Record a refund of ${formatAed(fils)}? This does not cancel the booking or free the booth.`)) return;
    post("refund", `/api/admin/payments/${p.id}/refund`, { amountAedFils: fils, method, reason, reference: reference || undefined });
  }

  return (
    <div className="rounded-xl border border-brown/10 bg-cream-soft/60 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-brown-dark">
          {p.methodLabel} · {new Date(p.createdAt).toLocaleString()}
        </span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{formatAed(p.amountAedFils)}</span>
          <StatusBadge label={LIFECYCLE_LABEL[p.lifecycle]} tone={tone[p.lifecycle]} />
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brown-light">
        {p.provider === "offline" && p.reference && <span>Ref: {p.reference}</span>}
        {p.note && <span>Note: {p.note}</span>}
        {p.refundedAedFils > 0 && <span>Refunded: {formatAed(p.refundedAedFils)}</span>}
        {p.receiptNumber && (
          <Link href={`/admin/payments/receipts/${p.id}`} target="_blank" className="underline underline-offset-2 text-brown-dark">
            Receipt {p.receiptNumber}
          </Link>
        )}
        {p.events.length > 0 && (
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="underline underline-offset-2 text-brown-dark">
            {showHistory ? "Hide history" : `History (${p.events.length})`}
          </button>
        )}
      </div>

      {p.needsAttention && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900" role="alert">
          <p className="font-medium">Needs attention</p>
          <p className="text-xs mt-0.5">{p.needsAttention}</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was done (e.g. refunded by bank transfer)"
              className="min-w-[240px] flex-1 rounded-lg border border-amber-300 bg-white/70 px-2 py-1.5 text-xs text-brown-dark"
            />
            <button
              disabled={busy !== null || note.trim().length < 3}
              onClick={() => post("clear", `/api/admin/payments/${p.id}/clear-attention`, { note })}
              className="rounded-full border border-amber-400 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {busy === "clear" ? "Saving…" : "Mark resolved"}
            </button>
          </div>
        </div>
      )}

      {p.refunds.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-brown-light">
          {p.refunds.map((r) => (
            <li key={r.id}>
              Refund {formatAed(r.amountAedFils)} · {REFUND_METHOD_LABEL[r.method] ?? r.method} · {new Date(r.createdAt).toLocaleDateString()} — {r.reason}
              {r.reference ? ` (ref ${r.reference})` : ""}
            </li>
          ))}
        </ul>
      )}

      {showHistory && (
        <ol className="mt-3 space-y-0.5 border-t border-brown/10 pt-2 text-xs text-brown-light">
          {p.events.map((e) => (
            <li key={e.id}>
              {new Date(e.createdAt).toLocaleString()} · {e.type.replaceAll("_", " ").toLowerCase()} · {e.actor.toLowerCase()}
            </li>
          ))}
        </ol>
      )}

      {refundable > 0 &&
        (refunding ? (
          <div className="mt-3 space-y-2 border-t border-brown/10 pt-3">
            <p className="text-xs text-brown-light">
              Records money returned to the vendor. It doesn&apos;t cancel the booking or free the booth; do that separately if needed.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-brown-light">
                Amount (AED, max {formatAed(refundable)})
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-32 rounded-lg border border-brown/20 bg-cream-soft px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-brown-light">
                How
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-brown/20 bg-cream-soft px-2 py-1.5">
                  {p.providerRefundable && <option value="ORIGINAL_METHOD">{REFUND_METHOD_LABEL.ORIGINAL_METHOD}</option>}
                  <option value="BANK_TRANSFER">Already paid back: bank transfer</option>
                  <option value="CASH">Already paid back: cash</option>
                  <option value="OTHER">Already paid back: other</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-brown-light">
                Reference
                <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} className="w-36 rounded-lg border border-brown/20 bg-cream-soft px-2 py-1.5" />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-brown-light">
              Reason (required)
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="rounded-lg border border-brown/20 bg-cream-soft px-2 py-1.5" />
            </label>
            <div className="flex gap-2">
              <button
                disabled={busy !== null || !amount || reason.trim().length < 3}
                onClick={submitRefund}
                className="rounded-full bg-brown px-4 py-1.5 text-xs text-cream-soft disabled:opacity-50"
              >
                {busy === "refund" ? "Recording…" : "Record refund"}
              </button>
              <button onClick={() => setRefunding(false)} className="rounded-full border border-brown/25 px-4 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setRefunding(true)} className="mt-3 text-xs text-brown-dark underline underline-offset-2">
            Record a refund
          </button>
        ))}

      {error && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
