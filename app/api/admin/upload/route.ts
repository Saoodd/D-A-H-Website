import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { safeUploadFilename, fileMatchesDeclaredType } from "@/lib/uploadSafety";
import { putPublic, isPublicBlobConfigError, PUBLIC_BLOB_NOT_CONFIGURED_MESSAGE } from "@/lib/blob";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB — a photo/scan of a venue floor plan
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Generic admin image upload — used by the floor plan builder and the
// event cover image field to let admin upload a photo directly instead of
// pasting a URL. Always public (venue photos, event covers are public-
// facing by nature) — stored in the PUBLIC Blob store (see lib/blob.ts),
// never the private/default store.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPEG, WEBP or GIF images are allowed." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 15MB)." }, { status: 400 });
  }
  if (!(await fileMatchesDeclaredType(file, file.type))) {
    return NextResponse.json({ error: "That file doesn't look like a real image of the type it claims to be." }, { status: 400 });
  }

  try {
    const blob = await putPublic(`floorplans/${safeUploadFilename(file.type)}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (err) {
    if (isPublicBlobConfigError(err)) {
      console.error("[admin upload] public Blob store not configured", { message: (err as Error).message });
      return NextResponse.json({ error: PUBLIC_BLOB_NOT_CONFIGURED_MESSAGE, code: "BLOB_NOT_CONFIGURED" }, { status: 503 });
    }
    console.error("[admin upload] failed", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
