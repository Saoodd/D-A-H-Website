"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DISPLAY_STATUS, DisplayStatus } from "@/lib/constants";
import { APPLICATION_DISPLAY_LABEL, APPLICATION_DISPLAY_TONE } from "@/lib/applicationDisplay";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export interface EventApplicationRow {
  id: string;
  vendorId: string;
  businessName: string;
  logoUrl: string | null;
  category: string;
  contactName: string;
  email: string;
  phone: string;
  createdAt: string;
  displayStatus: DisplayStatus;
  previousParticipation: number;
  hasActiveWarning: boolean;
}

type SortKey = "newest" | "oldest" | "business" | "status";

const REASON_LABEL: Record<string, string> = {
  not_found: "no longer exists",
  already_pending: "still pending (unexpected)",
  already_accepted: "already accepted",
  already_rejected: "already rejected",
  already_acceptance_expired: "acceptance already expired",
  already_paid: "already paid — booking untouched",
  race_lost: "changed at the same moment by another admin action",
};

export function EventApplicationsClient({
  eventName,
  applications,
}: {
  eventName: string;
  applications: EventApplicationRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"accept" | "reject" | null>(null);
  const [resultBanner, setResultBanner] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set(applications.map((a) => a.category))).sort(), [applications]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let rows = applications.filter((a) => {
      if (category && a.category !== category) return false;
      if (status && a.displayStatus !== status) return false;
      if (needle) {
        const haystack = `${a.businessName} ${a.contactName} ${a.email}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (sort === "business") return a.businessName.localeCompare(b.businessName);
      return a.displayStatus.localeCompare(b.displayStatus);
    });
    return rows;
  }, [applications, search, category, status, sort]);

  const visibleIds = visible.map((a) => a.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedRows = applications.filter((a) => selected.has(a.id));
  const selectedEligibleForAccept = selectedRows.filter((a) => a.displayStatus === "PENDING");
  const selectedEligibleForReject = selectedRows.filter((a) => a.displayStatus === "PENDING" || a.displayStatus === "ACCEPTED_UNPAID");

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });
  }

  function selectAllPending() {
    const pendingVisible = visible.filter((a) => a.displayStatus === "PENDING").map((a) => a.id);
    setSelected((prev) => new Set([...prev, ...pendingVisible]));
  }

  async function quickAction(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await fetch(`/api/admin/applications/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function runBulk(action: "accept" | "reject") {
    setBulkBusy(true);
    setResultBanner(null);
    try {
      const res = await fetch(`/api/admin/applications/bulk-${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResultBanner(data.error || "Something went wrong.");
        return;
      }
      const okCount = action === "accept" ? data.acceptedCount : data.rejectedCount;
      const skipped: { businessName?: string; reason?: string }[] = (data.results || []).filter((r: { ok: boolean }) => !r.ok);
      let msg = `${okCount} ${action === "accept" ? "accepted" : "rejected"} successfully.`;
      if (skipped.length > 0) {
        msg += ` ${skipped.length} skipped: ${skipped
          .map((s) => `${s.businessName || "one application"} (${REASON_LABEL[s.reason || ""] || s.reason})`)
          .join(", ")}.`;
      }
      setResultBanner(msg);
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkBusy(false);
      setConfirmMode(null);
    }
  }

  return (
    <div>
      {resultBanner && (
        <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">{resultBanner}</div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Business, contact, or email…"
            className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm">
            <option value="">All statuses</option>
            {DISPLAY_STATUS.map((s) => (
              <option key={s} value={s}>
                {APPLICATION_DISPLAY_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="business">Business name A–Z</option>
            <option value="status">Status</option>
          </select>
        </label>
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={selectAllVisible}>
            {allVisibleSelected ? "Deselect All Visible" : "Select All Visible"}
          </Button>
          <Button size="sm" variant="secondary" onClick={selectAllPending}>
            Select All Pending
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5 rounded-[10px] border border-brown/20 bg-cream-deep/30 px-4 py-3">
          <p className="text-sm text-brown-dark">{selected.size} selected</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setConfirmMode("accept")} disabled={bulkBusy}>
              Accept Selected
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmMode("reject")} disabled={bulkBusy}>
              Reject Selected
            </Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState title="No applications match these filters" />
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-brown/10">
          <table className="min-w-full text-sm bg-cream">
            <thead className="bg-cream-deep/40 text-brown-light text-xs uppercase">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allVisibleSelected} onChange={selectAllVisible} aria-label="Select all visible" />
                </th>
                <th className="text-left px-2 py-3">Business</th>
                <th className="text-left px-2 py-3">Category</th>
                <th className="text-left px-2 py-3">Contact</th>
                <th className="text-left px-2 py-3">Applied</th>
                <th className="text-left px-2 py-3">Status</th>
                <th className="text-left px-2 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id} className="border-t border-brown/10 align-top">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} aria-label={`Select ${a.businessName}`} />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2.5">
                      {a.logoUrl ? (
                        <img src={a.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 border border-brown/10" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-cream-deep shrink-0 flex items-center justify-center text-[10px] text-brown-light">
                          {a.businessName.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/admin/applications/${a.id}`} className="text-brown-dark hover:underline font-medium truncate">
                            {a.businessName}
                          </Link>
                          {a.hasActiveWarning && (
                            <span title="Active warning on file" className="text-amber-700 text-xs" aria-label="Active warning">
                              ⚠
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-brown-light">
                          {a.previousParticipation > 0
                            ? `${a.previousParticipation} prior DAH event${a.previousParticipation === 1 ? "" : "s"}`
                            : "First-time applicant"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-brown-dark">{a.category}</td>
                  <td className="px-2 py-3">
                    <p className="text-brown-dark">{a.contactName}</p>
                    <a href={`mailto:${a.email}`} className="text-xs text-brown-light underline underline-offset-2 hover:text-brown-dark block">
                      {a.email}
                    </a>
                    <a href={`tel:${a.phone}`} className="text-xs text-brown-light underline underline-offset-2 hover:text-brown-dark">
                      {a.phone}
                    </a>
                  </td>
                  <td className="px-2 py-3 text-xs text-brown-light whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString()}</td>
                  <td className="px-2 py-3">
                    <StatusBadge label={APPLICATION_DISPLAY_LABEL[a.displayStatus]} tone={APPLICATION_DISPLAY_TONE[a.displayStatus]} />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-col gap-1.5 items-start">
                      <Link href={`/admin/vendors/${a.vendorId}`} className="text-xs text-brown underline underline-offset-2">
                        View Vendor
                      </Link>
                      {a.displayStatus === "PENDING" && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => quickAction(a.id, "approve")} loading={busyId === a.id}>
                            Accept
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => quickAction(a.id, "reject")} loading={busyId === a.id}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmMode === "accept" && (
        <BulkConfirmModal
          title={`Accept ${selectedEligibleForAccept.length} vendor${selectedEligibleForAccept.length === 1 ? "" : "s"} to ${eventName}?`}
          body="These vendors will receive an acceptance and their 3-hour completion deadline will begin."
          ineligibleCount={selectedRows.length - selectedEligibleForAccept.length}
          confirmLabel={`Accept ${selectedEligibleForAccept.length} Vendor${selectedEligibleForAccept.length === 1 ? "" : "s"}`}
          busy={bulkBusy}
          destructive={false}
          disabled={selectedEligibleForAccept.length === 0}
          onCancel={() => setConfirmMode(null)}
          onConfirm={() => runBulk("accept")}
        />
      )}
      {confirmMode === "reject" && (
        <BulkConfirmModal
          title={`Reject ${selectedEligibleForReject.length} vendor${selectedEligibleForReject.length === 1 ? "" : "s"} for ${eventName}?`}
          body="They will be notified and will not be able to continue this application unless re-accepted individually. This cannot be undone."
          ineligibleCount={selectedRows.length - selectedEligibleForReject.length}
          confirmLabel={`Reject ${selectedEligibleForReject.length} Vendor${selectedEligibleForReject.length === 1 ? "" : "s"}`}
          busy={bulkBusy}
          destructive
          disabled={selectedEligibleForReject.length === 0}
          onCancel={() => setConfirmMode(null)}
          onConfirm={() => runBulk("reject")}
        />
      )}
    </div>
  );
}

function BulkConfirmModal({
  title,
  body,
  ineligibleCount,
  confirmLabel,
  busy,
  destructive,
  disabled,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  ineligibleCount: number;
  confirmLabel: string;
  busy: boolean;
  destructive: boolean;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4" role="dialog" aria-modal="true">
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-[10px] bg-cream border border-brown/10 p-6 sm:p-7">
        <h2 className="font-heading text-xl text-brown-dark mb-3">{title}</h2>
        <p className="text-sm text-brown-light mb-2">{body}</p>
        {ineligibleCount > 0 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
            {ineligibleCount} of the selected application{ineligibleCount === 1 ? " is" : "s are"} no longer eligible and will be skipped.
          </p>
        )}
        <div className="flex flex-col gap-3 mt-5">
          <Button onClick={onConfirm} loading={busy} disabled={disabled} variant={destructive ? "destructive" : "primary"} size="lg" className="w-full">
            {confirmLabel}
          </Button>
          <Button onClick={onCancel} disabled={busy} variant="secondary" size="lg" className="w-full">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
