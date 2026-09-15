import "server-only";
import { put, del, BlobError, type PutBlobResult } from "@vercel/blob";
import { isOwnedBlobUrl } from "@/lib/uploadSafety";

// This project has TWO connected Vercel Blob stores:
// - the original/default store — ambient BLOB_READ_WRITE_TOKEN /
//   BLOB_STORE_ID + VERCEL_OIDC_TOKEN, resolved automatically by
//   @vercel/blob with no explicit options passed. Kept PRIVATE: trade
//   licences, receipts, any other admin-only document. Every private-file
//   call site (lib/uploadSafety.ts's deleteBlobIfOwned, lib/privateDocs.ts,
//   the trade-license branch of the vendor upload routes) deliberately
//   keeps calling put()/get()/del() with no explicit auth options, so it
//   stays on the default store, completely unchanged by this module.
// - a second store connected to the same project with the "PUBLIC_BLOB"
//   environment-variable prefix — for anything meant to be shown on the
//   public site: gallery photos, event covers, floor plan images, vendor
//   logos. Everything in this file explicitly targets that store and never
//   relies on the ambient default, which would silently write to (or read
//   from) the PRIVATE store instead.

function publicBlobAuth(): { token: string } | { storeId: string } | null {
  const token = process.env.PUBLIC_BLOB_READ_WRITE_TOKEN;
  if (token) return { token };
  // storeId alone is resolved against the ambient VERCEL_OIDC_TOKEN by
  // @vercel/blob itself — the same OIDC mechanism the default store's own
  // ambient resolution uses, just pointed at a different store.
  const storeId = process.env.PUBLIC_BLOB_STORE_ID;
  if (storeId) return { storeId };
  return null;
}

export const PUBLIC_BLOB_NOT_CONFIGURED_MESSAGE = "File uploads aren't configured yet — please contact DAH.";

class PublicBlobNotConfiguredError extends Error {
  constructor() {
    super("Neither PUBLIC_BLOB_READ_WRITE_TOKEN nor PUBLIC_BLOB_STORE_ID is set — the public Blob store isn't connected.");
  }
}

/** True when the failure means the PUBLIC store specifically has no usable
 *  credentials — either neither PUBLIC_BLOB_* env var is set at all, or
 *  @vercel/blob itself rejected what we explicitly passed. Distinguishes a
 *  genuine configuration problem from any other upload failure, the same
 *  way lib/uploadSafety.ts's isBlobConfigError() does for the private
 *  store. Callers should log the real error server-side (safe — never a
 *  secret) and show PUBLIC_BLOB_NOT_CONFIGURED_MESSAGE only in this case. */
export function isPublicBlobConfigError(err: unknown): boolean {
  return err instanceof PublicBlobNotConfiguredError || (err instanceof BlobError && /no blob credentials found/i.test(err.message));
}

/** put(), but always targeting the explicit PUBLIC store — never the
 *  ambient default. Use for every image meant to be shown on the public
 *  site: gallery photos, event covers, floor plan images, vendor logos. */
export async function putPublic(
  pathname: string,
  body: Blob | File,
  options: { access: "public"; addRandomSuffix?: boolean; contentType?: string }
): Promise<PutBlobResult> {
  const auth = publicBlobAuth();
  if (!auth) throw new PublicBlobNotConfiguredError();
  return put(pathname, body, { ...options, ...auth });
}

/** Deletes a PUBLIC-store Blob object at `url` if it's one of ours — same
 *  never-throws contract as lib/uploadSafety.ts's deleteBlobIfOwned: a
 *  cleanup failure (already deleted, transient error, not actually a Blob
 *  URL, store not configured) must never block or roll back the DB update
 *  that's the actual point of the request. Callers must already have
 *  confirmed no OTHER row still references this exact URL before calling
 *  this. */
export async function deletePublicBlobIfOwned(url: string | null | undefined): Promise<void> {
  if (!url || !isOwnedBlobUrl(url)) return;
  const auth = publicBlobAuth();
  if (!auth) {
    console.error("[blob:public] cleanup delete skipped — public Blob store not configured");
    return;
  }
  try {
    await del(url, auth);
  } catch (err) {
    console.error("[blob:public] cleanup delete failed", err);
  }
}
