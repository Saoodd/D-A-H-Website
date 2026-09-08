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

  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const query = `type=${type}${eventId ? `&eventId=${eventId}` : ""}`;

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

  if (loading) return <p className="text-sm text-brown-light">Loading…</p>;

  return (
    <div className="space-y-8">
      <div className="rounded-[10px] border border-brown/10 bg-cream p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <p className="label-caps">Currently published</p>
          {published ? (
            <StatusBadge label={`v${published.version}`} tone="positive" />
          ) : (
            <StatusBadge label="None published" tone="attention" />
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
        <div className="rounded-[10px] border border-amber-300/60 bg-amber-50 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="label-caps text-amber-900">Draft — version {draft.version} (not yet live)</p>
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
          <div className="flex flex-wrap gap-3">
            <Button onClick={save} loading={saving} variant="secondary">
              Save draft
            </Button>
            <Button onClick={publish} loading={publishing}>
              Publish
            </Button>
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
