import "server-only";
import { randomUUID } from "crypto";

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

// @vercel/blob resolves credentials itself, in this priority order: an
// explicit `token`/`oidcToken` option (never passed anywhere in this app),
// then `VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID` (short-lived, auto-rotated by
// Vercel when the connected store has OIDC enabled — no static secret in
// this app at all), then the static `BLOB_READ_WRITE_TOKEN`. This just
// mirrors that same priority so a pre-flight "is Blob even configured"
// check doesn't wrongly report "not configured" when only the OIDC pair is
// present.
export function isBlobConfigured(): boolean {
  return !!((process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) || process.env.BLOB_READ_WRITE_TOKEN);
}

export const BLOB_NOT_CONFIGURED_MESSAGE = "File uploads aren't configured yet — please contact DAH.";

// Sensible, conservative defaults for a batch gallery upload — shown in the
// admin UI and enforced server-side identically, so the two can never
// disagree. Comfortably inside any Vercel Blob plan's per-file and
// concurrent-request limits.
export const GALLERY_MAX_BATCH = 20;
export const GALLERY_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
