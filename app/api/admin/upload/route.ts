import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAdmin } from "@/lib/adminGuard";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB — a photo/scan of a venue floor plan
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Generic admin image upload (used by the floor plan builder to let admin
// upload a venue photo/scan directly instead of pasting a URL). Stored in
// Vercel Blob — requires BLOB_READ_WRITE_TOKEN, see .env.example.
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

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "File uploads aren't configured yet — connect a Blob store to this project in Vercel (Storage → Create Database → Blob)." },
      { status: 500 }
    );
  }

  try {
    const blob = await put(`floorplans/${Date.now()}-${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    return NextResponse.json({ ok: true, url: blob.url });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
