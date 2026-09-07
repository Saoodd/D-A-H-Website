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

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
