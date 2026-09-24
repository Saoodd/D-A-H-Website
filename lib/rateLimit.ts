import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "./prisma";

// Fixed-window rate limiter backed by Postgres (RateLimitBucket), so every
// serverless instance shares one counter per key. The previous in-memory
// Map was per-instance: on Vercel, requests spread across instances or cold
// starts could exceed the limit.
//
// Each check is a single atomic INSERT ... ON CONFLICT DO UPDATE, so
// concurrent requests for the same key serialize on that row — two
// simultaneous requests can't both read "under the limit". Times use the
// database clock (now()), never an app server's, so instances with skewed
// clocks can't disagree about window boundaries.
//
// All functions here are async: callers MUST await them — `!rateLimit(...)`
// without await tests a Promise (always truthy) and silently never limits.

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + (${windowMs}::double precision * interval '1 millisecond'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN 1
                     ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN EXCLUDED."resetAt"
                       ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count"
  `);
  return Number(rows[0].count) <= limit;
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
export async function peekCooldown(key: string): Promise<{ onCooldown: boolean; retryAfterSeconds?: number }> {
  const rows = await prisma.$queryRaw<{ remaining: number | null }[]>(Prisma.sql`
    SELECT EXTRACT(EPOCH FROM ("resetAt" - now()))::double precision AS "remaining"
    FROM "RateLimitBucket" WHERE "key" = ${key} AND "resetAt" > now()
  `);
  if (rows.length === 0 || rows[0].remaining === null) return { onCooldown: false };
  return { onCooldown: true, retryAfterSeconds: Math.max(1, Math.ceil(Number(rows[0].remaining))) };
}

export async function armCooldown(key: string, windowMs: number): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + (${windowMs}::double precision * interval '1 millisecond'))
    ON CONFLICT ("key") DO UPDATE SET "count" = 1, "resetAt" = EXCLUDED."resetAt"
  `);
}

/** Deletes long-expired buckets so the table doesn't grow without bound
 *  (keys include IPs and emails). Called by the hourly cron. */
export async function purgeExpiredRateLimits(): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    DELETE FROM "RateLimitBucket" WHERE "resetAt" < now() - interval '1 day'
  `);
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
