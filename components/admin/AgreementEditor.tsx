"use client";

import { useEffect, useState } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Card";

interface AgreementRow {
  id: string;
  version: number;
  title: string;
  bodyHtml?: string;
  status: string;
  publishedAt: string | null;
  createdAt?: string;
  acceptanceCount?: number;
}

const statusTone: Record<string, "positive" | "neutral" | "attention"> = {
  PUBLISHED: "positive",
  DRAFT: "attention",
  ARCHIVED: "neutral",
};

export function AgreementEditor({
  type,
  eventId,
  scopeLabel,
}: {
  type: "VENDOR_TERMS" | "EVENT_TERMS";
  eventId?: string;
  scopeLabel: string;
}) {
  const [published, setPublished] = useState<AgreementRow | null>(null);
  const [draft, setDraft] = useState<AgreementRow | null>(null);
  const [history, setHistory] = useState<AgreementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewVersion, setPreviewVersion] = useState<AgreementRow | null>(null);
  const [previewingDraft, setPreviewingDraft] = useState(false);

  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  const [savedBodyHtml, setSavedBodyHtml] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const query = `type=${type}${eventId ? `&eventId=${eventId}` : ""}`;
  const hasUnsavedChanges = !!draft && (title !== savedTitle || bodyHtml !== savedBodyHtml);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/agreements?${query}`);
      const data = await res.json();
      setPublished(data.published);
      setDraft(data.draft);
      setHistory(data.history || []);
      if (data.draft) {
        setTitle(data.draft.title);
        setBodyHtml(data.draft.bodyHtml);
        setSavedTitle(data.draft.title);
        setSavedBodyHtml(data.draft.bodyHtml);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount / when scope changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the scope itself changes
  }, [query]);

  // Warn before an accidental tab close / navigation away while a draft has
  // unsaved edits — this never fires for a merely-viewed published version.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  async function startDraft() {
    setStarting(true);
    try {
      const res = await fetch("/api/admin/agreements/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, eventId }),
      });
      const data = await res.json();
      if (res.ok) {
        setDraft(data.draft);
        setTitle(data.draft.title);
        setBodyHtml(data.draft.bodyHtml);
        setSavedTitle(data.draft.title);
        setSavedBodyHtml(data.draft.bodyHtml);
      }
    } finally {
      setStarting(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/agreements/draft/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, bodyHtml }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save draft");
      setSavedTitle(title);
      setSavedBodyHtml(bodyHtml);
      setLastSavedAt(new Date());
      setNotice("Draft saved.");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save draft");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!draft) return;
    if (
      !confirm(
        `Publish version ${draft.version} of "${title}"? This becomes the live agreement immediately — any vendor who already accepted an earlier version will need to accept this one before continuing.`
      )
    ) {
      return;
    }
    setPublishing(true);
    setNotice(null);
    try {
      await save();
      const res = await fetch(`/api/admin/agreements/draft/${draft.id}/publish`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not publish");
      setNotice("Published.");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not publish");
    } finally {
      setPublishing(false);
    }
  }

  async function discardDraft() {
    if (!draft) return;
    setConfirmingDiscard(false);
    setDiscarding(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/agreements/draft/${draft.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not discard draft");
      setDraft(null);
      setTitle("");
      setBodyHtml("");
      setLastSavedAt(null);
      setPreviewingDraft(false);
      setNotice("Draft discarded.");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not discard draft");
    } finally {
      setDiscarding(false);
    }
  }

  if (loading) return <p className="text-sm text-brown-light">Loading…</p>;

  return (
    <div className="space-y-8">
      <div className="rounded-[10px] border border-brown/10 bg-cream p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <p className="label-caps">Currently published</p>
          {published ? (
            <StatusBadge label={`v${published.version}`} tone="positive" />
          ) : (
            <StatusBadge label="Not configured" tone="attention" />
          )}
        </div>
        {published ? (
          <div>
            <p className="font-heading text-lg text-brown-dark">{published.title}</p>
            <p className="text-xs text-brown-light mt-1">
              Published {published.publishedAt ? new Date(published.publishedAt).toLocaleString() : "—"} ·{" "}
              {published.acceptanceCount ?? 0} vendor{(published.acceptanceCount ?? 0) === 1 ? "" : "s"} accepted this version
            </p>
          </div>
        ) : (
          <p className="text-sm text-brown-light">No {scopeLabel} has been published yet — vendors won&rsquo;t be asked to accept anything until you publish one.</p>
        )}
      </div>

      {!draft && (
        <Button onClick={startDraft} loading={starting} variant="secondary">
          {published ? "Edit — start a new draft" : "Write the first version"}
        </Button>
      )}

      {draft && (
        <div className="rounded-[10px] border border-amber-300/60 bg-amber-50 dark:bg-amber-950/10 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="label-caps text-amber-900 dark:text-amber-400">Draft — Version {draft.version} (not yet live)</p>
              <p className="text-xs text-amber-800/80 dark:text-amber-400/70 mt-0.5">
                {saving
                  ? "Saving…"
                  : hasUnsavedChanges
                  ? "Unsaved changes"
                  : lastSavedAt
                  ? `Last saved ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "Not saved yet"}
              </p>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
            />
          </label>
          <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
          {notice && <p className="text-sm text-brown-dark">{notice}</p>}

          {/* Always-visible action row — Save / Preview / Publish / Discard, so
              it's never ambiguous which document (draft vs. live) is being
              edited: everything in this amber block is the draft. */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-amber-300/40">
            <Button onClick={save} loading={saving} variant="secondary">
              Save Draft
            </Button>
            <Button onClick={() => setPreviewingDraft((v) => !v)} variant="secondary">
              {previewingDraft ? "Hide Preview" : "Preview"}
            </Button>
            <Button onClick={publish} loading={publishing}>
              Publish Version
            </Button>
            <Button onClick={() => setConfirmingDiscard(true)} variant="ghost" disabled={discarding}>
              Discard Draft
            </Button>
          </div>

          {previewingDraft && (
            <div className="rounded-[10px] border border-brown/20 bg-cream p-6">
              <p className="label-caps mb-3">Preview — Draft v{draft.version}</p>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </div>
          )}
        </div>
      )}

      {confirmingDiscard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" role="dialog" aria-modal="true" aria-label="Discard draft">
          <div className="w-full max-w-sm rounded-[10px] bg-cream border border-brown/10 p-6">
            <p className="font-heading text-lg text-brown-dark mb-2">Discard this draft?</p>
            <p className="text-sm text-brown-light mb-6">
              Your unpublished changes will be deleted. The currently published version will remain unchanged.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setConfirmingDiscard(false)}>
                Keep Editing
              </Button>
              <Button variant="destructive" size="sm" onClick={discardDraft} loading={discarding}>
                Discard Draft
              </Button>
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="label-caps mb-3">Version history</p>
        {history.length === 0 ? (
          <EmptyState title="No versions yet" />
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => setPreviewVersion(previewVersion?.id === h.id ? null : h)}
                className="w-full text-left flex items-center justify-between gap-3 rounded-[8px] border border-brown/10 bg-cream hover:border-brown/25 px-4 py-3 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-brown-dark">
                    v{h.version} — {h.title}
                  </p>
                  <p className="text-xs text-brown-light mt-0.5">
                    {h.status === "PUBLISHED" && h.publishedAt ? `Published ${new Date(h.publishedAt).toLocaleDateString()}` : h.status === "DRAFT" ? "In progress" : "Archived"}
                    {" · "}
                    {h.acceptanceCount ?? 0} accepted
                  </p>
                </div>
                <StatusBadge label={h.status} tone={statusTone[h.status] ?? "neutral"} />
              </button>
            ))}
          </div>
        )}
      </div>

      {previewVersion && previewVersion.bodyHtml && (
        <div className="rounded-[10px] border border-brown/20 bg-cream p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-heading text-lg text-brown-dark">
              Preview — v{previewVersion.version} ({previewVersion.status})
            </p>
            <button onClick={() => setPreviewVersion(null)} className="text-xs text-brown-light underline">
              Close
            </button>
          </div>
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewVersion.bodyHtml }} />
        </div>
      )}
    </div>
  );
}
