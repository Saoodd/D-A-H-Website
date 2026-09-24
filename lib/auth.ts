import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { ADMIN_COOKIE, VENDOR_COOKIE, signToken, verifyToken } from "./sessionToken";

const ADMIN_SESSION_SECONDS = 60 * 60 * 12; // 12h
const VENDOR_SESSION_SECONDS = 60 * 60 * 24 * 60; // 60 days

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

// A fixed, never-matching bcrypt hash used to keep a failed login's timing
// indistinguishable from a real one — see verifyPasswordOrDummy below.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeOxRt.hnLm0RaHRPfmS/2Tg0PA1IzMfPu";

/** Same cost as a real bcrypt.compare, run even when no account was found,
 *  so "no such account" and "wrong password" take the same time — a login
 *  response's timing alone should never reveal whether an identifier is
 *  registered. Always returns false when hash is null (no vendor found). */
export async function verifyPasswordOrDummy(pw: string, hash: string | null): Promise<boolean> {
  const result = await bcrypt.compare(pw, hash ?? DUMMY_HASH);
  return hash !== null && result;
}

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

// --- Admin session -----------------------------------------------------------
//
// Sessions are backed by a DB row (AdminSession/VendorSession), not just a
// self-contained JWT — the JWT only carries that row's id (`sid`). This is
// what makes logout and (for vendors) a password reset actually revoke the
// token immediately, rather than leaving a captured copy of the cookie
// valid until its natural expiry (up to 60 days for a vendor session).

export async function createAdminSession() {
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_SECONDS * 1000);
  const session = await prisma.adminSession.create({ data: { expiresAt } });
  const token = await signToken({ admin: true, sid: session.id }, ADMIN_SESSION_SECONDS);
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, { ...cookieOpts, maxAge: ADMIN_SESSION_SECONDS });
}

export async function destroyAdminSession() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) {
    const payload = await verifyToken<{ admin: boolean; sid: string }>(token);
    if (payload?.sid) {
      await prisma.adminSession.updateMany({ where: { id: payload.sid, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => {});
    }
  }
  store.delete(ADMIN_COOKIE);
}

export async function getAdminSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const payload = await verifyToken<{ admin: boolean; sid: string }>(token);
  if (!payload?.admin || !payload.sid) return false;

  const session = await prisma.adminSession.findUnique({ where: { id: payload.sid } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return false;
  return true;
}

// --- Vendor session ----------------------------------------------------------

export async function createVendorSession(vendorId: string) {
  const expiresAt = new Date(Date.now() + VENDOR_SESSION_SECONDS * 1000);
  const session = await prisma.vendorSession.create({ data: { vendorId, expiresAt } });
  const token = await signToken({ vendorId, sid: session.id }, VENDOR_SESSION_SECONDS);
  const store = await cookies();
  store.set(VENDOR_COOKIE, token, { ...cookieOpts, maxAge: VENDOR_SESSION_SECONDS });
}

export async function destroyVendorSession() {
  const store = await cookies();
  const token = store.get(VENDOR_COOKIE)?.value;
  if (token) {
    const payload = await verifyToken<{ vendorId: string; sid: string }>(token);
    if (payload?.sid) {
      await prisma.vendorSession.updateMany({ where: { id: payload.sid, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => {});
    }
  }
  store.delete(VENDOR_COOKIE);
}

export async function getVendorSession(): Promise<{ vendorId: string } | null> {
  const store = await cookies();
  const token = store.get(VENDOR_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken<{ vendorId: string; sid: string }>(token);
  if (!payload?.vendorId || !payload.sid) return null;

  const session = await prisma.vendorSession.findUnique({ where: { id: payload.sid } });
  if (!session || session.revokedAt || session.expiresAt < new Date() || session.vendorId !== payload.vendorId) return null;
  return { vendorId: payload.vendorId };
}

/** Revokes every currently-active session for a vendor — used after a
 *  password reset (and account closure) so a session token captured before
 *  that point stops working immediately, instead of remaining valid until
 *  its natural expiry regardless of the password change. */
export async function invalidateAllVendorSessions(vendorId: string) {
  await prisma.vendorSession.updateMany({ where: { vendorId, revokedAt: null }, data: { revokedAt: new Date() } });
}
