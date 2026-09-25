// Shared helpers for the end-to-end suites in this folder. Every suite
// talks to a running server over HTTP and to the LOCAL database directly
// (to create fixtures and check what was stored), and cleans up after
// itself. Run them through `npm run test:e2e` (scripts/e2e.mjs).
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";

export { prisma };
export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const PASSWORD = "E2e-test-password-1";

// Never let a test touch anything but a local database.
const dbUrl = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(dbUrl)) {
  console.error("Refusing to run: DATABASE_URL is not a local database.");
  process.exit(2);
}

/** Call first in every suite: the login rate limiter is shared and
 *  persistent, so earlier suites would otherwise lock later ones out. */
export async function setup() {
  await prisma.rateLimitBucket.deleteMany({});
}

type Check = { name: string; ok: boolean; got?: unknown };
const checks: Check[] = [];
export function check(name: string, ok: boolean, got?: unknown) {
  checks.push({ name, ok, got: ok ? undefined : got });
}

/** Prints results and sets the exit code. Call once, in `finally`. */
export async function finish(suite: string) {
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : `  -> ${JSON.stringify(c.got)?.slice(0, 400)}`}`);
  console.log(`\n[${suite}] ${checks.length - failed.length}/${checks.length} passed`);
  await prisma.$disconnect();
  if (failed.length || checks.length === 0) process.exitCode = 1;
}

export interface Res {
  status: number;
  json: Record<string, unknown> & { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- test assertions read arbitrary response fields
  cookie?: string;
  setCookie: string | null;
}
async function toRes(r: Response): Promise<Res> {
  const setCookie = r.headers.get("set-cookie");
  return { status: r.status, json: await r.json().catch(() => ({})), cookie: setCookie?.split(";")[0], setCookie };
}
export const post = (path: string, cookie?: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: JSON.stringify(body ?? {}),
  }).then(toRes);
export const get = (path: string, cookie?: string | null) => fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }).then(toRes);
export const page = (path: string, cookie?: string | null) => fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }).then((r) => r.text());

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A throwaway vendor. `verified` sets a verified phone (needed to apply/hold/pay). */
export async function makeVendor(opts: { verified?: boolean; tag?: string } = {}) {
  const u = `e2e${opts.tag ?? ""}${uniq()}`.toLowerCase();
  const phone = `+9715${String(Date.now() + seq * 7919).slice(-8)}`;
  return prisma.vendor.create({
    data: {
      email: `${u}@example.test`,
      username: u,
      usernameLower: u,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      businessName: `E2E ${u}`,
      contactName: "E2E Tester",
      phone,
      category: "Food",
      ...(opts.verified ? { phoneVerifiedAt: new Date(), phoneVerifiedNumber: phone } : {}),
    },
  });
}

export async function vendorLogin(username: string, userAgent?: string): Promise<string> {
  const r = await post("/api/vendor/login", null, { identifier: username, password: PASSWORD }, userAgent ? { "user-agent": userAgent } : {});
  if (!r.cookie) throw new Error(`vendor login failed (${r.status})`);
  return r.cookie;
}

export async function adminLogin(): Promise<string> {
  const r = await post("/api/admin/login", null, { password: process.env.ADMIN_PASSWORD });
  if (!r.cookie) throw new Error(`admin login failed (${r.status})`);
  return r.cookie;
}

/** A published throwaway event with `booths` available booths at a fixed price. */
export async function makeEvent(booths: number, priceAedFils = 150000) {
  const slug = `e2e-${uniq()}`;
  const event = await prisma.event.create({
    data: { slug, name: `E2E Event ${slug}`, startDate: new Date(Date.now() + 30 * 86400_000), location: "Test Venue", status: "PUBLISHED" },
  });
  await prisma.booth.createMany({
    data: Array.from({ length: booths }, (_, i) => ({ eventId: event.id, code: `T${i + 1}`, gridX: 5 + i * 10, gridY: 10, gridW: 8, gridH: 8, priceAedFils })),
  });
  const rows = await prisma.booth.findMany({ where: { eventId: event.id }, orderBy: { gridX: "asc" } });
  return { event, booths: rows };
}

/** An ACCEPTED application for `vendor` at `eventId`, with a 3-hour acceptance window. */
export function makeAcceptedApplication(vendor: { id: string; businessName: string; contactName: string; phone: string; email: string }, eventId: string) {
  return prisma.application.create({
    data: {
      vendorId: vendor.id,
      eventId,
      businessName: vendor.businessName,
      contactName: vendor.contactName,
      phone: vendor.phone,
      email: vendor.email,
      category: "Food",
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptanceExpiresAt: new Date(Date.now() + 3 * 3600_000),
    },
  });
}

/** Removes everything the fixtures above created, including payment records. */
export async function cleanup({ eventIds = [] as string[], vendorIds = [] as string[] }) {
  const appIds = (await prisma.application.findMany({ where: { OR: [{ eventId: { in: eventIds } }, { vendorId: { in: vendorIds } }] }, select: { id: true } })).map((a) => a.id);
  const payIds = (await prisma.payment.findMany({ where: { applicationId: { in: appIds } }, select: { id: true } })).map((p) => p.id);
  await prisma.paymentWebhookEvent.deleteMany({ where: { paymentId: { in: payIds } } });
  await prisma.paymentEvent.deleteMany({ where: { OR: [{ paymentId: { in: payIds } }, { applicationId: { in: appIds } }] } });
  await prisma.paymentRefund.deleteMany({ where: { paymentId: { in: payIds } } });
  await prisma.paymentBooth.deleteMany({ where: { paymentId: { in: payIds } } });
  await prisma.payment.deleteMany({ where: { id: { in: payIds } } });
  await prisma.agreementAcceptance.deleteMany({ where: { OR: [{ vendorId: { in: vendorIds } }, { applicationId: { in: appIds } }] } });
  await prisma.booth.updateMany({ where: { eventId: { in: eventIds } }, data: { heldByApplicationId: null, assignedApplicationId: null } });
  await prisma.application.deleteMany({ where: { id: { in: appIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
  await prisma.rateLimitBucket.deleteMany({});
}

/** Minimal cookie jar for redirect-driven flows (OAuth). */
export class Jar {
  c = new Map<string, string>();
  take(res: Response) {
    for (const sc of res.headers.getSetCookie()) {
      const [kv] = sc.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /Max-Age=0/i.test(sc) || /Expires=Thu, 01 Jan 1970/i.test(sc)) this.c.delete(k);
      else this.c.set(k, v);
    }
  }
  header() {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}
