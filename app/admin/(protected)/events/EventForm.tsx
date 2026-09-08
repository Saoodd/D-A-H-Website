"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  showPublicPricing: boolean;
  status: string;
  whatsappVendorGroupLink: string | null;
  acceptanceDeadlineHours: number | null;
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
  const [duplicateFrom, setDuplicateFrom] = useState("");
  const [categories, setCategories] = useState<string[]>(initial?.categories || []);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [showPublicPricing, setShowPublicPricing] = useState(initial?.showPublicPricing ?? true);

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
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      slug: form.get("slug"),
      description: form.get("description"),
      startDate: form.get("startDate"),
      endDate: form.get("endDate") || null,
      location: form.get("location"),
      coverImage: form.get("coverImage") || null,
      categories,
      floorPlanImageUrl: form.get("floorPlanImageUrl") || null,
      venueWidthM: form.get("venueWidthM") || null,
      showPublicPricing,
      status: form.get("status"),
      whatsappVendorGroupLink: form.get("whatsappVendorGroupLink") || null,
      acceptanceDeadlineHours: form.get("acceptanceDeadlineHours") || null,
      duplicateFromEventId: duplicateFrom || undefined,
    };
    try {
      const res = await fetch(initial ? `/api/admin/events/${initial.id}` : "/api/admin/events", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
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

      <Field name="coverImage" label="Cover image URL" defaultValue={initial?.coverImage ?? undefined} span2 />
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

      {error && <p className="sm:col-span-2 text-sm text-red-700">{error}</p>}

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
