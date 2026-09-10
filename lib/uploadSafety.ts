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
