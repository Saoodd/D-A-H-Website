"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatAed, DisplayStatus } from "@/lib/constants";
import { MetricCard, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface VendorFull {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  category: string;
  description: string;
  instagram: string | null;
  website: string | null;
  logoUrl: string | null;
  verified: boolean;
  createdAt: string;
  tradeLicenseNumber: string | null;
  tradeLicenseFileUrl: string | null;
  tradeLicenseExpiry: string | null;
}

interface AppRow {
  id: string;
  eventName: string;
  eventStartDate: string;
  status: string;
  displayStatus: DisplayStatus;
  boothCode: string | null;
}

interface NoteRow {
  id: string;
  note: string;
  createdAt: string;
}

interface WarningRow {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  adminNote: string | null;
  eventName: string | null;
  viewedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

const displayStatusTone: Record<DisplayStatus, "neutral" | "positive" | "attention" | "negative"> = {
  PENDING: "neutral",
  REJECTED: "negative",
  ACCEPTED_UNPAID: "attention",
  PAID: "positive",
  EXPIRED: "neutral",
};

const severityTone: Record<string, "neutral" | "attention" | "negative"> = {
  NOTICE: "neutral",
  WARNING: "attention",
  FINAL_WARNING: "negative",
};

const statusTone: Record<string, "neutral" | "positive"> = {
  ACTIVE: "neutral",
  RESOLVED: "positive",
  WITHDRAWN: "neutral",
};

export function VendorDetailClient({
  vendor,
  stats,
  applications,
  notes,
  warnings,
  events,
}: {
  vendor: VendorFull;
  stats: { eventsParticipated: number; upcomingConfirmedCount: number; applicationsCount: number; totalPaidAedFils: number };
  applications: AppRow[];
  notes: NoteRow[];
  warnings: WarningRow[];
  events: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [verifyBusy, setVerifyBusy] = useState(false);

  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const [warnTitle, setWarnTitle] = useState("");
  const [warnDescription, setWarnDescription] = useState("");
  const [warnSeverity, setWarnSeverity] = useState("NOTICE");
  const [warnEventId, setWarnEventId] = useState("");
  const [warnAdminNote, setWarnAdminNote] = useState("");
  const [warnBusy, setWarnBusy] = useState(false);
  const [warnFormOpen, setWarnFormOpen] = useState(false);

  const [editingWarningId, setEditingWarningId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSeverity, setEditSeverity] = useState("NOTICE");
  const [editBusy, setEditBusy] = useState(false);

  const uniqueEvents = Array.from(new Map(events.map((e) => [e.id, e])).values());

  async function setVerified(verified: boolean) {
    setVerifyBusy(true);
    try {
      await fetch(`/api/admin/vendors/${vendor.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified }),
      });
      router.refresh();
    } finally {
      setVerifyBusy(false);
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setNoteBusy(true);
    try {
      const res = await fetch(`/api/admin/vendors/${vendor.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText.trim() }),
      });
      if (res.ok) {
        setNoteText("");
        router.refresh();
      }
    } finally {
      setNoteBusy(false);
    }
  }

  async function deleteNote(noteId: string) {
    await fetch(`/api/admin/vendors/${vendor.id}/notes/${noteId}`, { method: "DELETE" });
    router.refresh();
  }

  async function issueWarning() {
    if (!warnTitle.trim() || !warnDescription.trim()) return;
    setWarnBusy(true);
    try {
      const res = await fetch(`/api/admin/vendors/${vendor.id}/warnings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: warnTitle.trim(),
          description: warnDescription.trim(),
          severity: warnSeverity,
          eventId: warnEventId || undefined,
          adminNote: warnAdminNote.trim() || undefined,
        }),
      });
      if (res.ok) {
        setWarnTitle("");
        setWarnDescription("");
        setWarnSeverity("NOTICE");
        setWarnEventId("");
        setWarnAdminNote("");
        setWarnFormOpen(false);
        router.refresh();
      }
    } finally {
      setWarnBusy(false);
    }
  }

  async function setWarningStatus(warningId: string, status: string) {
    await fetch(`/api/admin/vendors/${vendor.id}/warnings/${warningId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  function startEdit(w: WarningRow) {
    setEditingWarningId(w.id);
    setEditTitle(w.title);
    setEditDescription(w.description);
    setEditSeverity(w.severity);
  }

  async function saveEdit(warningId: string) {
    setEditBusy(true);
    try {
      const res = await fetch(`/api/admin/vendors/${vendor.id}/warnings/${warningId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), description: editDescription.trim(), severity: editSeverity }),
      });
      if (res.ok) {
        setEditingWarningId(null);
        router.refresh();
      }
    } finally {
      setEditBusy(false);
    }
  }

  const activeWarningsCount = warnings.filter((w) => w.status === "ACTIVE").length;
  const resolvedWarningsCount = warnings.filter((w) => w.status !== "ACTIVE").length;

  return (
    <div>
      <Link href="/admin/vendors" className="text-sm text-brown-light underline">
        &larr; Vendors
      </Link>

      <div className="mt-4 flex items-start justify-between flex-wrap gap-4 mb-8">
        <div className="flex items-center gap-4">
          {vendor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- vendor-uploaded logo via Blob
            <img src={vendor.logoUrl} alt="" className="w-16 h-16 rounded-full object-cover border border-brown/10" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-cream-deep flex items-center justify-center font-heading text-xl text-brown-dark">
              {vendor.businessName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-2xl text-brown-dark">{vendor.businessName}</h1>
              <StatusBadge label={vendor.verified ? "Verified" : "Unverified"} tone={vendor.verified ? "positive" : "attention"} />
              {activeWarningsCount > 0 && (
                <StatusBadge label={`${activeWarningsCount} active warning${activeWarningsCount === 1 ? "" : "s"}`} tone="negative" />
              )}
            </div>
            <p className="text-sm text-brown-light mt-1">
              {vendor.contactName} · {vendor.email} · {vendor.phone}
            </p>
            <p className="text-xs text-brown-light mt-0.5">
              {vendor.category}
              {vendor.instagram ? ` · @${vendor.instagram.replace(/^@/, "")}` : ""} · Member since{" "}
              {new Date(vendor.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <Button variant={vendor.verified ? "secondary" : "primary"} onClick={() => setVerified(!vendor.verified)} loading={verifyBusy}>
          {vendor.verified ? "Unverify" : "Verify vendor"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Events participated" value={stats.eventsParticipated} />
        <MetricCard label="Upcoming confirmed" value={stats.upcomingConfirmedCount} />
        <MetricCard label="Total applications" value={stats.applicationsCount} />
        <MetricCard label="Total paid" value={formatAed(stats.totalPaidAedFils)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <p className="label-caps mb-3">Business details</p>
            <div className="rounded-[10px] border border-brown/10 bg-cream p-5 text-sm space-y-2">
              {vendor.description && <p className="text-brown-dark">{vendor.description}</p>}
              {vendor.website && (
                <p>
                  <span className="text-brown-light">Website: </span>
                  <a href={vendor.website} target="_blank" rel="noreferrer" className="underline text-brown">
                    {vendor.website}
                  </a>
                </p>
              )}
              <p>
                <span className="text-brown-light">Trade license: </span>
                {vendor.tradeLicenseNumber || "—"}
                {vendor.tradeLicenseExpiry ? ` · expires ${vendor.tradeLicenseExpiry}` : ""}
                {vendor.tradeLicenseFileUrl && (
                  <>
                    {" · "}
                    <a href={vendor.tradeLicenseFileUrl} target="_blank" rel="noreferrer" className="underline text-brown">
                      view document
                    </a>
                  </>
                )}
              </p>
            </div>
          </section>

          <section>
            <p className="label-caps mb-3">Applications</p>
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
                      <p className="text-sm font-medium text-brown-dark">{a.eventName}</p>
                      <p className="text-xs text-brown-light">
                        {new Date(a.eventStartDate).toLocaleDateString()}
                        {a.boothCode ? ` · Booth ${a.boothCode}` : ""}
                      </p>
                    </div>
                    <StatusBadge label={a.displayStatus} tone={displayStatusTone[a.displayStatus]} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="label-caps">Warnings & notices</p>
              <button onClick={() => setWarnFormOpen((v) => !v)} className="text-xs underline text-brown">
                {warnFormOpen ? "Cancel" : "Issue warning"}
              </button>
            </div>
            <p className="text-xs text-brown-light mb-3">
              {activeWarningsCount} active · {resolvedWarningsCount} resolved/withdrawn
            </p>

            {warnFormOpen && (
              <div className="rounded-[10px] border border-brown/10 bg-cream p-5 mb-4 space-y-3">
                <input
                  value={warnTitle}
                  onChange={(e) => setWarnTitle(e.target.value)}
                  placeholder="Title (e.g. Late setup)"
                  className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
                />
                <textarea
                  value={warnDescription}
                  onChange={(e) => setWarnDescription(e.target.value)}
                  placeholder="Explanation shown to the vendor"
                  rows={2}
                  className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
                />
                <div className="grid sm:grid-cols-2 gap-3">
                  <select
                    value={warnSeverity}
                    onChange={(e) => setWarnSeverity(e.target.value)}
                    className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
                  >
                    <option value="NOTICE">Notice</option>
                    <option value="WARNING">Warning</option>
                    <option value="FINAL_WARNING">Final warning</option>
                  </select>
                  <select
                    value={warnEventId}
                    onChange={(e) => setWarnEventId(e.target.value)}
                    className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
                  >
                    <option value="">No related event</option>
                    {uniqueEvents.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={warnAdminNote}
                  onChange={(e) => setWarnAdminNote(e.target.value)}
                  placeholder="Private admin note (never shown to the vendor)"
                  rows={2}
                  className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
                />
                <Button size="sm" onClick={issueWarning} loading={warnBusy} disabled={!warnTitle.trim() || !warnDescription.trim()}>
                  Issue warning
                </Button>
              </div>
            )}

            {warnings.length === 0 ? (
              <EmptyState title="No warnings on this account" />
            ) : (
              <div className="space-y-3">
                {warnings.map((w) => (
                  <div key={w.id} className="rounded-[10px] border border-brown/10 bg-cream p-4">
                    {editingWarningId === w.id ? (
                      <div className="space-y-2">
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
                        />
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          rows={2}
                          className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
                        />
                        <select
                          value={editSeverity}
                          onChange={(e) => setEditSeverity(e.target.value)}
                          className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
                        >
                          <option value="NOTICE">Notice</option>
                          <option value="WARNING">Warning</option>
                          <option value="FINAL_WARNING">Final warning</option>
                        </select>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(w.id)} loading={editBusy}>
                            Save
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditingWarningId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <StatusBadge label={w.severity.replace("_", " ")} tone={severityTone[w.severity] ?? "neutral"} />
                            <StatusBadge label={w.status} tone={statusTone[w.status] ?? "neutral"} />
                            <p className="text-sm font-medium text-brown-dark">{w.title}</p>
                          </div>
                          <div className="flex gap-2 text-xs">
                            <button onClick={() => startEdit(w)} className="underline text-brown">
                              Edit
                            </button>
                            {w.status === "ACTIVE" && (
                              <>
                                <button onClick={() => setWarningStatus(w.id, "RESOLVED")} className="underline text-emerald-700">
                                  Resolve
                                </button>
                                <button onClick={() => setWarningStatus(w.id, "WITHDRAWN")} className="underline text-brown-light">
                                  Withdraw (issued in error)
                                </button>
                              </>
                            )}
                            {w.status !== "ACTIVE" && (
                              <button onClick={() => setWarningStatus(w.id, "ACTIVE")} className="underline text-brown-light">
                                Reactivate
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-brown-light mt-2">{w.description}</p>
                        <p className="text-xs text-brown-light mt-2">
                          {new Date(w.createdAt).toLocaleDateString()}
                          {w.eventName ? ` · ${w.eventName}` : ""} ·{" "}
                          {w.acknowledgedAt ? "Acknowledged by vendor" : w.viewedAt ? "Viewed, not acknowledged" : "Not yet viewed"}
                        </p>
                        {w.adminNote && (
                          <p className="text-xs text-brown-light mt-1 italic">Private note: {w.adminNote}</p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-8">
          <section>
            <p className="label-caps mb-3">Internal admin notes</p>
            <p className="text-xs text-brown-light mb-3">Private — never shown to the vendor.</p>
            <div className="space-y-3 mb-4">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm"
              />
              <Button size="sm" onClick={addNote} loading={noteBusy} disabled={!noteText.trim()}>
                Add note
              </Button>
            </div>
            {notes.length === 0 ? (
              <p className="text-xs text-brown-light">No notes yet.</p>
            ) : (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div key={n.id} className="rounded-[8px] border border-brown/10 bg-cream p-3">
                    <p className="text-sm text-brown-dark">{n.note}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[11px] text-brown-light">{new Date(n.createdAt).toLocaleString()}</p>
                      <button onClick={() => deleteNote(n.id)} className="text-[11px] underline text-brown-light">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
