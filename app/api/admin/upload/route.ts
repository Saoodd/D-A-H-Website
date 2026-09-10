import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAdmin } from "@/lib/adminGuard";
import { safeUploadFilename, isBlobConfigured, BLOB_NOT_CONFIGURED_MESSAGE } from "@/lib/uploadSafety";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB — a photo/scan of a venue floor plan
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Generic admin image upload — used by the floor plan builder and the
// event cover image field to let admin upload a photo directly instead of
// pasting a URL. Always public (venue photos, event covers are public-
// facing by nature). Stored in Vercel Blob — see .env.example for how
// credentials resolve (OIDC when the connected store has it enabled,
// BLOB_READ_WRITE_TOKEN otherwise).
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

  if (!isBlobConfigured()) {
    return NextResponse.json({ error: BLOB_NOT_CONFIGURED_MESSAGE }, { status: 500 });
  }

  try {
    const blob = await put(`floorplans/${safeUploadFilename(file.type)}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
