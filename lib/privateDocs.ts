import "server-only";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

/** Streams a private Blob document back through OUR server, never the raw
 *  Blob URL — a private blob requires Blob-level auth to fetch at all, so
 *  the only way a vendor/admin ever sees the file is through a route that
 *  has already checked they're authorized to see it. Callers do that
 *  authorization check (session + ownership) before calling this. */
export async function streamPrivateDocument(url: string): Promise<NextResponse> {
  const result = await get(url, { access: "private" }).catch(() => null);
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": result.blob.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
