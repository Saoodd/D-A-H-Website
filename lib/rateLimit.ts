import "server-only";

// Minimal in-memory sliding-window rate limiter. Good enough to blunt naive
// bot/abuse traffic on a single-instance deployment. Note: on a multi-instance
// serverless deployment each instance has its own memory, so this is a soft
// limit, not a hard guarantee — swap for a shared store (e.g. Upstash Redis)
// if you need a hard limit across instances.

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Single-slot "cooldown" (e.g. resend verification email/SMS), split into a
 *  read-only check and an explicit arm step — deliberately NOT one
 *  check-and-set call. A cooldown must only start counting down after the
 *  guarded action actually succeeded (e.g. the SMS provider accepted the
 *  send); arming it just because the action was ATTEMPTED would lock a
 *  vendor out of retrying for the full window after a failure that never
 *  sent anything (invalid number, provider outage, etc.). Callers: peek
 *  before attempting, armCooldown only once the attempt has actually
 *  succeeded. */
export function peekCooldown(key: string): { onCooldown: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) return { onCooldown: false };
  return { onCooldown: true, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
}

export function armCooldown(key: string, windowMs: number): void {
  buckets.set(key, { count: 1, resetAt: Date.now() + windowMs });
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
