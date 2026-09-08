"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";

interface Img {
  id: string;
  url: string;
  caption: string;
  sortOrder: number;
}

export function GalleryAdminClient({ images }: { images: Img[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addWithUrl(finalUrl: string) {
    if (!finalUrl) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalUrl, caption }),
      });
      if (!res.ok) throw new Error("Could not add image");
      setUrl("");
      setCaption("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add image");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await addWithUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const idx = images.findIndex((i) => i.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= images.length) return;
    await Promise.all([
      fetch(`/api/admin/gallery/${images[idx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: images[swapIdx].sortOrder }),
      }),
      fetch(`/api/admin/gallery/${images[swapIdx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: images[idx].sortOrder }),
      }),
    ]);
    router.refresh();
  }

  async function updateCaption(id: string, newCaption: string) {
    await fetch(`/api/admin/gallery/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: newCaption }),
    });
  }

  async function remove(id: string) {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    await fetch(`/api/admin/gallery/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-8 bg-cream rounded-[10px] border border-brown/10 p-5 space-y-3">
        <p className="text-sm font-medium text-brown-dark">Add a photo</p>
        <p className="text-xs text-brown-light">Real DAH event photography only — this feeds the public gallery and homepage preview.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="px-4 py-2 rounded-[6px] border border-brown/25 text-sm cursor-pointer hover:bg-brown hover:text-cream-soft transition-colors">
            {uploading ? "Uploading…" : "Upload photo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) uploadFile(file);
              }}
            />
          </label>
          <span className="text-xs text-brown-light">or paste a URL:</span>
          <input
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 min-w-[180px] border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            placeholder="Caption (optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="flex-1 min-w-[180px] border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
          />
          <Button size="sm" variant="secondary" onClick={() => addWithUrl(url)} loading={busy} disabled={!url}>
            Add from URL
          </Button>
        </div>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>

      {images.length === 0 ? (
        <EmptyState title="No photos yet" description="Upload real DAH event photography to populate the public gallery." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {images.map((img, i) => (
            <div key={img.id} className="rounded-[10px] overflow-hidden border border-brown/10 bg-cream">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed uploads/URLs, not local static assets */}
              <img src={img.url} alt={img.caption} className="w-full h-40 object-cover" />
              <div className="p-3 space-y-2">
                <input
                  defaultValue={img.caption}
                  placeholder="Caption"
                  onBlur={(e) => updateCaption(img.id, e.target.value)}
                  className="w-full text-xs border border-brown/15 rounded px-2 py-1 bg-cream-soft"
                />
                <div className="flex items-center justify-between text-xs">
                  <div className="flex gap-2">
                    <button onClick={() => move(img.id, -1)} disabled={i === 0} className="text-brown-light disabled:opacity-30">
                      ↑
                    </button>
                    <button onClick={() => move(img.id, 1)} disabled={i === images.length - 1} className="text-brown-light disabled:opacity-30">
                      ↓
                    </button>
                  </div>
                  <button onClick={() => remove(img.id)} className="text-red-700 underline">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
