import "server-only";
import { randomUUID } from "crypto";
import { del, BlobError } from "@vercel/blob";

// The client-supplied filename (and its MIME type) are both attacker
// controlled — a request can declare any `type` and `name` it likes
// regardless of the file's real bytes. Every upload route checks `type`
// against its own allowlist first; this only decides what to call the
// stored file afterwards, so the extension actually served back always
// matches a type this route already approved, never whatever extension the
// uploader happened to name their file.
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/** A random, storage-safe filename for an already MIME-allowlisted upload —
 *  never derived from the client-supplied name, so it can't carry a
 *  path-traversal sequence or a misleading/executable extension. */
export function safeUploadFilename(mimeType: string): string {
  const ext = EXTENSION_BY_MIME[mimeType] ?? "bin";
  return `${randomUUID()}.${ext}`;
}

// @vercel/blob resolves credentials itself: an explicit `token`/`oidcToken`
// option (never passed anywhere in this app), then the Vercel-issued OIDC
// token (delivered per-request via an `x-vercel-oidc-token` header that
// @vercel/blob's own SDK reads internally — NOT reliably mirrored into
// `process.env.VERCEL_OIDC_TOKEN`, so checking that env var directly here
// is not a valid way to predict whether OIDC auth will actually work) with
// `BLOB_STORE_ID`, then the static `BLOB_READ_WRITE_TOKEN`. Rather than
// guess at credential availability ahead of time, every upload route below
// just attempts the real `put()` call and uses isBlobConfigError() on the
// result — the SDK itself is the only reliable source of truth here.
export const BLOB_NOT_CONFIGURED_MESSAGE = "File uploads aren't configured yet — please contact DAH.";

/** True when `err` is @vercel/blob reporting that it found no usable
 *  credentials at all (no token option, no OIDC token + store ID, no
 *  BLOB_READ_WRITE_TOKEN) — a genuine configuration problem, as opposed to
 *  a transient provider/network failure. Callers should log the real
 *  message (safe — it's the SDK's own generic text, never a secret) and
 *  show BLOB_NOT_CONFIGURED_MESSAGE to the user only in this case. */
export function isBlobConfigError(err: unknown): boolean {
  return err instanceof BlobError && /no blob credentials found/i.test(err.message);
}

// Sensible, conservative defaults for a batch gallery upload — shown in the
// admin UI and enforced server-side identically, so the two can never
// disagree. Comfortably inside any Vercel Blob plan's per-file and
// concurrent-request limits.
export const GALLERY_MAX_BATCH = 20;
export const GALLERY_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

// The browser-declared `file.type` (and the multipart Content-Type header
// it comes from) is fully attacker-controlled — a request can claim
// "image/png" for any bytes it likes. This checks the file's actual first
// bytes against the real signature for the MIME type it claims to be, so a
// renamed/relabeled executable or script can never pass the MIME allowlist
// just because the client said so. Deliberately conservative: only the
// types this app ever allows need a signature; anything else is rejected
// by the MIME allowlist before this even runs.
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/png": (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  "image/jpeg": (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  "image/gif": (b) => b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61,
  "application/pdf": (b) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d,
};

/** True only if `buffer`'s actual leading bytes match the real file
 *  signature for `mimeType`. Call this in addition to (never instead of)
 *  the existing MIME-allowlist check on every upload route. */
export async function fileMatchesDeclaredType(file: File, mimeType: string): Promise<boolean> {
  const check = SIGNATURES[mimeType];
  if (!check) return false;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return check(head);
}

// Every Blob object this app creates lives under a *.public.blob.vercel-
// storage.com or *.blob.vercel-storage.com host — matching that before
// calling del() means a legacy admin-pasted Gallery "Add from URL" link
// (which can be any arbitrary URL, never a real Blob object) is silently
// left alone instead of triggering a failed/no-op delete against some
// unrelated third-party host.
function isOwnedBlobUrl(url: string): boolean {
  try {
    return /\.public\.blob\.vercel-storage\.com$|\.blob\.vercel-storage\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Deletes the Blob object at `url` if it's one of ours — used whenever a
 *  stored file (vendor logo, trade licence, event cover/floor plan,
 *  gallery photo) is replaced or removed, so the old object doesn't sit
 *  around as orphaned storage forever. Never throws: a cleanup failure
 *  (already deleted, transient error, not actually a Blob URL) must never
 *  block or roll back the database update that's the actual point of the
 *  request. Callers must already have confirmed no OTHER row still
 *  references this exact URL before calling this. */
export async function deleteBlobIfOwned(url: string | null | undefined): Promise<void> {
  if (!url || !isOwnedBlobUrl(url)) return;
  try {
    await del(url);
  } catch (err) {
    console.error("[blob] cleanup delete failed", err);
  }
}
