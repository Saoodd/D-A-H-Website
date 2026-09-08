import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getVendorSession } from "@/lib/auth";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB — a logo image or a trade license scan
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

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
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPEG, WEBP images or PDF documents are allowed." }, { status: 400 });
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
    const blob = await put(`vendor-docs/${session.vendorId}/${Date.now()}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
