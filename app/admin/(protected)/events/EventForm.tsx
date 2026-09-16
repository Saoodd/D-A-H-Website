"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface EventData {
  id: string;
  name: string;
  slug: string;
  description: string;
  startDate: string;
  endDate: string | null;
  location: string;
  coverImage: string | null;
  categories: string[];
  floorPlanImageUrl: string | null;
  venueWidthM: number | null;
  venueWidthMm?: number | null;
  venueDepthMm?: number | null;
  venueScaleConfirmed?: boolean;
  showPublicPricing: boolean;
  status: string;
  whatsappVendorGroupLink: string | null;
  acceptanceDeadlineHours: number | null;
  allowMultipleBooths: boolean | null;
}

function toInputDate(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function EventForm({
  existingEvents,
  initial,
}: {
  existingEvents: { id: string; name: string }[];
  initial?: EventData;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsRequired, setTermsRequired] = useState(false);
  const [duplicateFrom, setDuplicateFrom] = useState("");
  const [copyTerms, setCopyTerms] = useState(false);
  const [categories, setCategories] = useState<string[]>(initial?.categories || []);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [showPublicPricing, setShowPublicPricing] = useState(initial?.showPublicPricing ?? true);
  const [coverImage, setCoverImage] = useState(initial?.coverImage || "");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [allowMultipleBooths, setAllowMultipleBooths] = useState(
    initial?.allowMultipleBooths === true ? "on" : initial?.allowMultipleBooths === false ? "off" : "default"
  );

  async function uploadCoverImage(file: File) {
    setUploadingCover(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setCoverImage(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingCover(false);
    }
  }

  function addCategory() {
    const v = categoryDraft.trim();
    if (v && !categories.includes(v)) setCategories((c) => [...c, v]);
    setCategoryDraft("");
  }

  function removeCategory(v: string) {
    setCategories((c) => c.filter((x) => x !== v));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setTermsRequired(false);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      slug: form.get("slug"),
      description: form.get("description"),
      startDate: form.get("startDate"),
      endDate: form.get("endDate") || null,
      location: form.get("location"),
      coverImage: coverImage || null,
      categories,
      floorPlanImageUrl: form.get("floorPlanImageUrl") || null,
      venueWidthM: form.get("venueWidthM") || null,
      showPublicPricing,
      status: form.get("status"),
      whatsappVendorGroupLink: form.get("whatsappVendorGroupLink") || null,
      acceptanceDeadlineHours: form.get("acceptanceDeadlineHours") || null,
      allowMultipleBooths: allowMultipleBooths === "default" ? null : allowMultipleBooths === "on",
      duplicateFromEventId: duplicateFrom || undefined,
      copyTerms: duplicateFrom ? copyTerms : undefined,
    };
    try {
      const res = await fetch(initial ? `/api/admin/events/${initial.id}` : "/api/admin/events", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "TERMS_REQUIRED") {
          setTermsRequired(true);
          setError(data.error);
          return;
        }
        throw new Error(data.error || "Save failed");
      }
      router.push(`/admin/events/${data.event.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-4 bg-cream rounded-2xl border border-brown/10 p-6">
      <Field name="name" label="Event name" defaultValue={initial?.name} required span2 />
      <Field name="slug" label="URL slug (optional)" defaultValue={initial?.slug} />
      <Field name="location" label="Location / venue" defaultValue={initial?.location} required />
      <Field name="startDate" label="Start date" type="date" defaultValue={toInputDate(initial?.startDate ?? null)} required />
      <Field name="endDate" label="End date (optional)" type="date" defaultValue={toInputDate(initial?.endDate ?? null)} />
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select name="status" defaultValue={initial?.status || "DRAFT"} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft">
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="CLOSED">Closed</option>
        </select>
      </label>

      <div className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span>Vendor categories for this event</span>
        <div className="flex flex-wrap gap-2 mb-1">
          {categories.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 text-xs bg-cream-deep text-brown-dark rounded-full px-3 py-1">
              {c}
              <button type="button" onClick={() => removeCategory(c)} aria-label={`Remove ${c}`} className="text-brown-light hover:text-red-700">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={categoryDraft}
            onChange={(e) => setCategoryDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addCategory();
              }
            }}
            placeholder="e.g. Coffee — press Enter to add"
            className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft flex-1"
          />
          <button type="button" onClick={addCategory} className="px-4 py-2 rounded-lg border border-brown/30 text-sm">
            Add
          </button>
        </div>
        <span className="text-xs text-brown-light">
          Shown on the public event page, and offered as choices to vendors applying to this event.
        </span>
      </div>

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Cover image
        <div className="flex flex-wrap items-center gap-3">
          {coverImage && (
            // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded cover image via Blob, not a local static asset
            <img src={coverImage} alt="" className="w-20 h-14 rounded object-cover border border-brown/15" />
          )}
          <input
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="https://… or upload a photo"
            className="flex-1 min-w-[180px] border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
          />
          <label className="text-sm px-4 py-2 rounded-[6px] border border-brown/25 text-brown-dark hover:bg-brown/5 cursor-pointer whitespace-nowrap">
            {uploadingCover ? "Uploading…" : "Upload photo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploadingCover}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) uploadCoverImage(file);
              }}
            />
          </label>
        </div>
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Description
        <textarea name="description" rows={4} defaultValue={initial?.description} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
      </label>
      <Field name="whatsappVendorGroupLink" label="Event vendor WhatsApp group link" defaultValue={initial?.whatsappVendorGroupLink ?? undefined} span2 />
      <Field
        name="floorPlanImageUrl"
        label="Floor plan image URL (optional — a photo/scan of the real venue layout)"
        defaultValue={initial?.floorPlanImageUrl ?? undefined}
        span2
      />
      <Field
        name="acceptanceDeadlineHours"
        label="Acceptance deadline hours (override site default)"
        defaultValue={initial?.acceptanceDeadlineHours != null ? String(initial.acceptanceDeadlineHours) : undefined}
      />
      <Field
        name="venueWidthM"
        type="number"
        label="Real venue width in meters (optional — shows real distances while dragging booths)"
        defaultValue={initial?.venueWidthM != null ? String(initial.venueWidthM) : undefined}
      />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={showPublicPricing} onChange={(e) => setShowPublicPricing(e.target.checked)} />
        Show public pricing (&ldquo;Booths from AED X&rdquo;) on this event&rsquo;s public page
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Allow multiple booths per booking
        <select
          value={allowMultipleBooths}
          onChange={(e) => setAllowMultipleBooths(e.target.value)}
          className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
        >
          <option value="default">Use site default</option>
          <option value="on">On for this event</option>
          <option value="off">Off for this event</option>
        </select>
        <span className="text-xs text-brown-light">
          When on, a vendor can add a second booth to the same booking (maximum 2). Overrides the site-wide default
          in Settings for this event only.
        </span>
      </label>

      {!initial && existingEvents.length > 0 && (
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Base floor plan on existing event (optional)
          <select
            value={duplicateFrom}
            onChange={(e) => setDuplicateFrom(e.target.value)}
            className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
          >
            <option value="">— Start with an empty floor plan —</option>
            {existingEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-brown-light">
            Copies that event&rsquo;s booths &amp; layout as new, independent records, all reset to available.
          </span>
        </label>
      )}

      {!initial && duplicateFrom && (
        <label className="flex items-start gap-2 text-sm sm:col-span-2 rounded-lg border border-brown/15 bg-cream-soft px-4 py-3">
          <input type="checkbox" checked={copyTerms} onChange={(e) => setCopyTerms(e.target.checked)} className="mt-0.5" />
          <span>
            Copy Terms &amp; Conditions from the original event?
            <span className="block text-xs text-brown-light mt-0.5">
              Off by default — every event should have its own Terms. If checked, the source event&rsquo;s current published Terms become this event&rsquo;s
              starting v1 (a brand-new, independent version — editing one never affects the other).
            </span>
          </span>
        </label>
      )}

      {error && (
        <div className="sm:col-span-2 rounded-lg border border-red-300/50 bg-red-50 dark:bg-red-950/20 px-4 py-3">
          <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
          {termsRequired && initial?.id && (
            <Link
              href={`/admin/agreements/events/${initial.id}`}
              className="inline-block mt-2 text-sm underline text-red-800 dark:text-red-400 hover:no-underline"
            >
              Add Terms &amp; Conditions →
            </Link>
          )}
        </div>
      )}

      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="px-6 py-2.5 rounded-full bg-brown text-cream-soft text-sm disabled:opacity-50">
          {busy ? "Saving…" : initial ? "Save changes" : "Create event"}
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required,
  span2,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  span2?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${span2 ? "sm:col-span-2" : ""}`}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft"
      />
    </label>
  );
}
