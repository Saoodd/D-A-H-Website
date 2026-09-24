import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { safeUploadFilename, isBlobConfigError, BLOB_NOT_CONFIGURED_MESSAGE, fileMatchesDeclaredType } from "@/lib/uploadSafety";
import { putPublic, isPublicBlobConfigError, PUBLIC_BLOB_NOT_CONFIGURED_MESSAGE } from "@/lib/blob";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// Same split as /api/vendor/upload — the logo is public, a trade licence
// (personal business document) is stored private and only ever read back
// through /api/vendor/documents/trade-license once the account exists.
const PURPOSES = {
  logo: { types: ["image/png", "image/jpeg", "image/webp"], access: "public" as const, label: "PNG, JPEG or WEBP image" },
  "trade-license": { types: ["image/png", "image/jpeg", "application/pdf"], access: "private" as const, label: "PNG, JPEG image or PDF document" },
};
type Purpose = keyof typeof PURPOSES;

// Shared upload endpoint for the signup form's two optional files (business
// logo, trade licence) — before any account (and therefore any vendor
// session) exists yet. Rate-limited by IP since it can't be scoped to a
// vendor. Same Blob store as the authenticated vendor-upload route (see
// /api/vendor/upload) — the resulting URL is attached to the Vendor row
// when /api/vendor/register creates it.
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!(await rateLimit(`vendor-upload-signup:${ip}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  const purposeRaw = form?.get("purpose");
  const purpose: Purpose = purposeRaw === "trade-license" ? "trade-license" : "logo";
  const spec = PURPOSES[purpose];

  if (!spec.types.includes(file.type)) {
    return NextResponse.json({ error: `Only ${spec.label} files are allowed.` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (max 10MB)." }, { status: 400 });
  }
  if (!(await fileMatchesDeclaredType(file, file.type))) {
    return NextResponse.json({ error: `That file doesn't look like a real ${spec.label.toLowerCase()}.` }, { status: 400 });
  }

  try {
    const blob =
      purpose === "logo"
        ? await putPublic(`vendor-logos/signup/${safeUploadFilename(file.type)}`, file, {
            access: "public",
            addRandomSuffix: true,
            contentType: file.type,
          })
        : await put(`vendor-docs/signup/${safeUploadFilename(file.type)}`, file, {
            access: spec.access,
            addRandomSuffix: true,
            contentType: file.type,
          });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (err) {
    if (purpose === "logo" ? isPublicBlobConfigError(err) : isBlobConfigError(err)) {
      console.error("[vendor upload-signup] Blob not configured", { purpose, message: (err as Error).message });
      return NextResponse.json(
        { error: purpose === "logo" ? PUBLIC_BLOB_NOT_CONFIGURED_MESSAGE : BLOB_NOT_CONFIGURED_MESSAGE, code: "BLOB_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    console.error("[vendor upload-signup] failed", { purpose, message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
