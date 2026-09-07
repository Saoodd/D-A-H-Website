import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

const encoder = new TextEncoder();

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return encoder.encode(secret);
}

export const ADMIN_COOKIE = "dah_admin_session";
export const VENDOR_COOKIE = "dah_vendor_session";

const ADMIN_SESSION_SECONDS = 60 * 60 * 12; // 12h
const VENDOR_SESSION_SECONDS = 60 * 60 * 24 * 60; // 60 days

async function signToken(payload: Record<string, unknown>, expiresInSeconds: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(secretKey());
}

async function verifyToken<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as T;
  } catch {
    return null;
  }
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

// --- Admin session ----------------------------------------------------------

export async function createAdminSession() {
  const token = await signToken({ admin: true }, ADMIN_SESSION_SECONDS);
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, { ...cookieOpts, maxAge: ADMIN_SESSION_SECONDS });
}

export async function destroyAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function getAdminSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const payload = await verifyToken<{ admin: boolean }>(token);
  return !!payload?.admin;
}

// --- Vendor session ----------------------------------------------------------

export async function createVendorSession(vendorId: string) {
  const token = await signToken({ vendorId }, VENDOR_SESSION_SECONDS);
  const store = await cookies();
  store.set(VENDOR_COOKIE, token, { ...cookieOpts, maxAge: VENDOR_SESSION_SECONDS });
}

export async function destroyVendorSession() {
  const store = await cookies();
  store.delete(VENDOR_COOKIE);
}

export async function getVendorSession(): Promise<{ vendorId: string } | null> {
  const store = await cookies();
  const token = store.get(VENDOR_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken<{ vendorId: string }>(token);
  if (!payload?.vendorId) return null;
  return { vendorId: payload.vendorId };
}
