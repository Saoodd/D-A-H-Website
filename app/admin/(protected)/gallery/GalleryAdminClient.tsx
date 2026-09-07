"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  async function add() {
    if (!url) return;
    setBusy(true);
    try {
      await fetch("/api/admin/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, caption }),
      });
      setUrl("");
      setCaption("");
      router.refresh();
    } finally {
      setBusy(false);
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

  async function remove(id: string) {
    await fetch(`/api/admin/gallery/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="grid sm:grid-cols-3 gap-3 mb-8 bg-cream rounded-xl border border-brown/10 p-4">
        <input placeholder="Image URL" value={url} onChange={(e) => setUrl(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm sm:col-span-2" />
        <input placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm" />
        <button onClick={add} disabled={busy || !url} className="sm:col-span-3 px-4 py-2 rounded-full bg-brown text-cream-soft text-sm disabled:opacity-50 justify-self-start">
          Add image
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {images.map((img, i) => (
          <div key={img.id} className="rounded-xl overflow-hidden border border-brown/10 bg-cream-soft">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed external URLs, not local static assets */}
            <img src={img.url} alt={img.caption} className="w-full h-40 object-cover" />
            <div className="p-3 flex items-center justify-between text-xs">
              <span className="text-brown-light truncate">{img.caption || "—"}</span>
              <div className="flex gap-2">
                <button onClick={() => move(img.id, -1)} disabled={i === 0}>↑</button>
                <button onClick={() => move(img.id, 1)} disabled={i === images.length - 1}>↓</button>
                <button onClick={() => remove(img.id)} className="text-red-700">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
