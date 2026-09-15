import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { safeUploadFilename, GALLERY_MAX_FILE_BYTES, fileMatchesDeclaredType } from "@/lib/uploadSafety";
import { putPublic, isPublicBlobConfigError, PUBLIC_BLOB_NOT_CONFIGURED_MESSAGE } from "@/lib/blob";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Short-lived de-dup guard, keyed on a client-generated fileKey (one per
// selected photo in a batch). If the same key is submitted again — a
// double-click that slipped past the UI's own disabled-button guard, or a
// client-side retry after a dropped response — this returns the gallery
// row already created for it instead of creating a second one. In-memory
// only, same pattern/limitation as lib/rateLimit.ts (per-instance, soft
// guarantee) — sufficient here since the real guard is the UI never
// allowing two concurrent submits of the same queued file.
const recentUploads = new Map<string, { imageId: string; expiresAt: number }>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

function pruneExpired() {
  const now = Date.now();
  for (const [key, v] of recentUploads) {
    if (v.expiresAt < now) recentUploads.delete(key);
  }
}

// Uploads ONE gallery photo and creates its GalleryImage row in the same
// request — the admin UI fires one of these per selected file (with a
// small client-side concurrency cap), which is what gives independent
// per-file progress/success/failure and a clean "retry failed only".
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const fileKey = form?.get("fileKey") ? String(form.get("fileKey")) : null;

  if (fileKey) {
    pruneExpired();
    const cached = recentUploads.get(fileKey);
    if (cached) {
      const image = await prisma.galleryImage.findUnique({ where: { id: cached.imageId } });
      if (image) return NextResponse.json({ ok: true, image, deduped: true });
    }
  }

  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPEG or WEBP images are allowed." }, { status: 400 });
  }
  if (file.size > GALLERY_MAX_FILE_BYTES) {
    return NextResponse.json({ error: `File is too large (max ${GALLERY_MAX_FILE_BYTES / (1024 * 1024)}MB).` }, { status: 400 });
  }
  if (!(await fileMatchesDeclaredType(file, file.type))) {
    return NextResponse.json({ error: "That file doesn't look like a real image of the type it claims to be." }, { status: 400 });
  }

  const caption = typeof form?.get("caption") === "string" ? String(form.get("caption")).slice(0, 300) : "";

  try {
    const blob = await putPublic(`gallery/${safeUploadFilename(file.type)}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    const count = await prisma.galleryImage.count();
    const image = await prisma.galleryImage.create({ data: { url: blob.url, caption, sortOrder: count } });
    if (fileKey) recentUploads.set(fileKey, { imageId: image.id, expiresAt: Date.now() + DEDUP_WINDOW_MS });
    return NextResponse.json({ ok: true, image });
  } catch (err) {
    if (isPublicBlobConfigError(err)) {
      console.error("[gallery upload] public Blob store not configured", { message: (err as Error).message });
      return NextResponse.json({ error: PUBLIC_BLOB_NOT_CONFIGURED_MESSAGE, code: "BLOB_NOT_CONFIGURED" }, { status: 503 });
    }
    console.error("[gallery upload] failed", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
