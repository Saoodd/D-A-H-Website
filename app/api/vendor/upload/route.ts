import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getVendorSession } from "@/lib/auth";
import { safeUploadFilename, isBlobConfigError, BLOB_NOT_CONFIGURED_MESSAGE, fileMatchesDeclaredType } from "@/lib/uploadSafety";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// Trade licences carry personal/business documents and stay private
// (require Blob auth to fetch — see /api/vendor/documents/trade-license,
// the only route that ever reads one back); a logo is decorative and
// public the same way it always has been. Webp is accepted for the logo
// but deliberately not for a trade licence, matching the exact format
// list DAH asked for.
const PURPOSES = {
  logo: { types: ["image/png", "image/jpeg", "image/webp"], access: "public" as const, label: "PNG, JPEG or WEBP image" },
  "trade-license": { types: ["image/png", "image/jpeg", "application/pdf"], access: "private" as const, label: "PNG, JPEG image or PDF document" },
};
type Purpose = keyof typeof PURPOSES;

// Vendor-facing file upload (logo, trade license document) — reuses the same
// Vercel Blob store as the admin upload route, just scoped to the
// authenticated vendor's own session rather than admin auth.
export async function POST(req: NextRequest) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
    const blob = await put(`vendor-docs/${session.vendorId}/${safeUploadFilename(file.type)}`, file, {
      access: spec.access,
      addRandomSuffix: true,
      contentType: file.type,
    });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (err) {
    if (isBlobConfigError(err)) {
      console.error("[vendor upload] Blob not configured", { message: (err as Error).message });
      return NextResponse.json({ error: BLOB_NOT_CONFIGURED_MESSAGE, code: "BLOB_NOT_CONFIGURED" }, { status: 503 });
    }
    console.error("[vendor upload] failed", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
