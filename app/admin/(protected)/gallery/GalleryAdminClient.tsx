"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";

interface Img {
  id: string;
  url: string;
  caption: string;
  sortOrder: number;
}

type QueueStatus = "pending" | "uploading" | "done" | "error";

interface QueueItem {
  id: string; // also used as the server-side de-dup key
  file: File;
  previewUrl: string;
  caption: string;
  status: QueueStatus;
  progress: number;
  error: string | null;
}

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const CONCURRENCY = 3;

function bytesToMb(bytes: number) {
  return Math.round(bytes / (1024 * 1024));
}

function uploadOneFile(
  item: QueueItem,
  onProgress: (pct: number) => void
): Promise<{ ok: boolean; error?: string; image?: Img }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/gallery/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { ok?: boolean; image?: Img; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // ignore — falls through to the generic error below
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.ok && data.image) {
        resolve({ ok: true, image: data.image });
      } else {
        resolve({ ok: false, error: data.error || "Upload failed." });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error — please try again." });
    const form = new FormData();
    form.append("file", item.file);
    form.append("caption", item.caption);
    form.append("fileKey", item.id);
    xhr.send(form);
  });
}

async function runWithConcurrency(items: QueueItem[], limit: number, worker: (item: QueueItem) => Promise<void>) {
  let cursor = 0;
  async function next(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    await worker(items[index]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
}

export function GalleryAdminClient({
  images,
  maxBatch,
  maxFileBytes,
}: {
  images: Img[];
  maxBatch: number;
  maxFileBytes: number;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dragOverPicker, setDragOverPicker] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const [orderedImages, setOrderedImages] = useState(images);
  const [reordering, setReordering] = useState(false);
  const dragImageIndex = useRef<number | null>(null);

  // Legacy quick-add (paste a URL directly) — kept as a secondary option.
  const [url, setUrl] = useState("");
  const [urlCaption, setUrlCaption] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync the locally-reorderable copy whenever the server prop changes (router.refresh() after upload/reorder/delete), not a per-render loop
    setOrderedImages(images);
  }, [images]);

  useEffect(() => {
    // Revoke every queued preview URL on unmount so we don't leak memory.
    return () => {
      queue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup-only effect, must not re-run per queue change
  }, []);

  function addFiles(files: FileList | File[]) {
    setPickerError(null);
    const incoming = Array.from(files);
    const accepted: QueueItem[] = [];
    const rejections: string[] = [];

    for (const file of incoming) {
      if (queue.length + accepted.length >= maxBatch) {
        rejections.push(`Only ${maxBatch} photos can be queued at once — the rest were skipped.`);
        break;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        rejections.push(`${file.name}: only PNG, JPEG or WEBP images are allowed.`);
        continue;
      }
      if (file.size > maxFileBytes) {
        rejections.push(`${file.name}: too large (max ${bytesToMb(maxFileBytes)}MB).`);
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        caption: "",
        status: "pending",
        progress: 0,
        error: null,
      });
    }

    if (accepted.length > 0) setQueue((q) => [...q, ...accepted]);
    if (rejections.length > 0) setPickerError(rejections.join(" "));
  }

  function removeFromQueue(id: string) {
    setQueue((q) => {
      const item = q.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return q.filter((i) => i.id !== id);
    });
  }

  function updateQueueCaption(id: string, caption: string) {
    setQueue((q) => q.map((i) => (i.id === id ? { ...i, caption } : i)));
  }

  async function uploadQueue(itemsToUpload: QueueItem[]) {
    if (itemsToUpload.length === 0 || submitting) return; // double-submit guard
    setSubmitting(true);

    setQueue((q) => q.map((i) => (itemsToUpload.some((u) => u.id === i.id) ? { ...i, status: "uploading", progress: 0, error: null } : i)));

    await runWithConcurrency(itemsToUpload, CONCURRENCY, async (item) => {
      const result = await uploadOneFile(item, (pct) => {
        setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, progress: pct } : i)));
      });
      setQueue((q) =>
        q.map((i) =>
          i.id === item.id
            ? result.ok
              ? { ...i, status: "done", progress: 100 }
              : { ...i, status: "error", error: result.error || "Upload failed." }
            : i
        )
      );
    });

    setSubmitting(false);
    router.refresh();
    // Drop completed items from the queue (their thumbnail now lives in
    // the persisted grid below); keep failed ones so "Retry Failed" has
    // something to act on.
    setQueue((q) => {
      const stillNeeded = q.filter((i) => i.status !== "done");
      q.filter((i) => i.status === "done").forEach((i) => URL.revokeObjectURL(i.previewUrl));
      return stillNeeded;
    });
  }

  const pendingCount = queue.filter((i) => i.status === "pending").length;
  const failedCount = queue.filter((i) => i.status === "error").length;
  const overallProgress =
    queue.length === 0 ? 0 : Math.round(queue.reduce((sum, i) => sum + (i.status === "done" ? 100 : i.progress), 0) / queue.length);

  async function addWithUrl() {
    if (!url) return;
    setAddingUrl(true);
    setPickerError(null);
    try {
      const res = await fetch("/api/admin/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, caption: urlCaption }),
      });
      if (!res.ok) throw new Error("Could not add image");
      setUrl("");
      setUrlCaption("");
      router.refresh();
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : "Could not add image");
    } finally {
      setAddingUrl(false);
    }
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

  // --- Drag-and-drop reorder of the already-uploaded grid ---
  function handleImageDragStart(index: number) {
    dragImageIndex.current = index;
  }
  function handleImageDragOver(e: React.DragEvent, overIndex: number) {
    e.preventDefault();
    const from = dragImageIndex.current;
    if (from === null || from === overIndex) return;
    setOrderedImages((list) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(overIndex, 0, moved);
      return next;
    });
    dragImageIndex.current = overIndex;
  }
  async function handleImageDrop() {
    dragImageIndex.current = null;
    setReordering(true);
    try {
      await fetch("/api/admin/gallery/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: orderedImages.map((i) => i.id) }),
      });
      router.refresh();
    } finally {
      setReordering(false);
    }
  }

  return (
    <div>
      <div
        className={`mb-8 bg-cream rounded-[10px] border-2 border-dashed p-5 space-y-4 transition-colors ${
          dragOverPicker ? "border-brown bg-brown/5" : "border-brown/20"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverPicker(true);
        }}
        onDragLeave={() => setDragOverPicker(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverPicker(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-brown-dark">Upload photos</p>
            <p className="text-xs text-brown-light mt-0.5">
              Real DAH event photography only — this feeds the public gallery and homepage preview. Drag and drop images here, or click to
              choose.
            </p>
            <p className="text-xs text-brown-light mt-0.5">
              Up to {maxBatch} photos per upload · Maximum {bytesToMb(maxFileBytes)} MB per photo · PNG, JPEG or WEBP
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Choose photos
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {pickerError && <p className="text-xs text-red-700">{pickerError}</p>}

        {queue.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-brown-light">
                {queue.length} photo{queue.length === 1 ? "" : "s"} selected
                {submitting && ` · uploading (${overallProgress}%)`}
              </p>
              <div className="flex items-center gap-2">
                {failedCount > 0 && !submitting && (
                  <Button size="sm" variant="secondary" onClick={() => uploadQueue(queue.filter((i) => i.status === "error"))}>
                    Retry Failed ({failedCount})
                  </Button>
                )}
                <Button size="sm" onClick={() => uploadQueue(queue.filter((i) => i.status === "pending"))} disabled={submitting || pendingCount === 0} loading={submitting}>
                  Upload All ({pendingCount})
                </Button>
              </div>
            </div>

            {submitting && (
              <div className="h-1.5 rounded-full bg-cream-deep overflow-hidden mb-3">
                <div className="h-full bg-brown transition-all" style={{ width: `${overallProgress}%` }} />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {queue.map((item) => (
                <div key={item.id} className="rounded-[8px] overflow-hidden border border-brown/10 bg-cream-soft">
                  <div className="relative h-24">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob: object URL preview, never a network image */}
                    <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                    {item.status !== "done" && (
                      <button
                        type="button"
                        onClick={() => removeFromQueue(item.id)}
                        disabled={item.status === "uploading"}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs leading-5 text-center disabled:opacity-30"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    )}
                    {item.status === "uploading" && (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
                        <div className="h-full bg-white transition-all" style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                    {item.status === "done" && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-emerald-700 text-white text-xs leading-5 text-center">✓</span>
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <input
                      placeholder="Caption (optional)"
                      value={item.caption}
                      disabled={item.status === "uploading" || item.status === "done"}
                      onChange={(e) => updateQueueCaption(item.id, e.target.value)}
                      className="w-full text-[11px] border border-brown/15 rounded px-1.5 py-1 bg-cream disabled:opacity-50"
                    />
                    <p className="text-[10px] truncate text-brown-light" title={item.file.name}>
                      {item.status === "error" ? <span className="text-red-700">{item.error}</span> : item.file.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-brown-light">Or add from a URL instead</summary>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 min-w-[180px] border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
            />
            <input
              placeholder="Caption (optional)"
              value={urlCaption}
              onChange={(e) => setUrlCaption(e.target.value)}
              className="flex-1 min-w-[180px] border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm"
            />
            <Button size="sm" variant="secondary" onClick={addWithUrl} loading={addingUrl} disabled={!url}>
              Add from URL
            </Button>
          </div>
        </details>
      </div>

      {orderedImages.length === 0 ? (
        <EmptyState title="No photos yet" description="Upload real DAH event photography to populate the public gallery." />
      ) : (
        <div>
          <p className="text-xs text-brown-light mb-3">Drag photos to reorder — the public gallery and homepage preview follow this order.{reordering && " Saving…"}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {orderedImages.map((img, i) => (
              <div
                key={img.id}
                draggable
                onDragStart={() => handleImageDragStart(i)}
                onDragOver={(e) => handleImageDragOver(e, i)}
                onDrop={handleImageDrop}
                onDragEnd={handleImageDrop}
                className="rounded-[10px] overflow-hidden border border-brown/10 bg-cream cursor-grab active:cursor-grabbing"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed uploads/URLs, not local static assets */}
                <img src={img.url} alt={img.caption} className="w-full h-40 object-cover pointer-events-none" />
                <div className="p-3 space-y-2">
                  <input
                    defaultValue={img.caption}
                    placeholder="Caption"
                    onBlur={(e) => updateCaption(img.id, e.target.value)}
                    className="w-full text-xs border border-brown/15 rounded px-2 py-1 bg-cream-soft"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-brown-light">⠿ Drag to reorder</span>
                    <button onClick={() => remove(img.id)} className="text-red-700 underline">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
