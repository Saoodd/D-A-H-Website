import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { safeUploadFilename } from "@/lib/uploadSafety";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

// Shared upload endpoint for the signup form's two optional files (business
// logo, trade licence) — before any account (and therefore any vendor
// session) exists yet. Rate-limited by IP since it can't be scoped to a
// vendor. Same Blob store as the authenticated vendor-upload route (see
// /api/vendor/upload) — the resulting URL is attached to the Vendor row
// when /api/vendor/register creates it.
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`vendor-upload-signup:${ip}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PDF, JPG, PNG or WEBP files are allowed." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (max 10MB)." }, { status: 400 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "File uploads aren't configured yet — please contact DAH." },
      { status: 500 }
    );
  }

  try {
    const blob = await put(`vendor-docs/signup/${safeUploadFilename(file.type)}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
