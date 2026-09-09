import "server-only";
import { randomBytes, createHash } from "crypto";

// Shared secure single-use-token pattern for password reset and email
// change: generate a high-entropy raw token, email/link only the raw
// value, and store only its SHA-256 hash — so a compromised database
// snapshot alone can never be used to complete either flow. `usedAt`
// marks a token consumed the moment it's redeemed, making reuse
// impossible even if the link is opened twice.

export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}
