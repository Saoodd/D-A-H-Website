import { SignJWT, jwtVerify } from "jose";

// Session-cookie names and JWT sign/verify, with no database, next/headers
// or server-only imports — so proxy.ts can use them too (Next recommends
// keeping the proxy free of shared app modules). The JWT only proves the
// cookie was issued by us and hasn't expired; whether the session is still
// live (not revoked by logout/password reset) is a database check, done by
// lib/auth.ts on every page and API request.

export const ADMIN_COOKIE = "dah_admin_session";
export const VENDOR_COOKIE = "dah_vendor_session";

const encoder = new TextEncoder();

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return encoder.encode(secret);
}

export async function signToken(payload: Record<string, unknown>, expiresInSeconds: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(secretKey());
}

export async function verifyToken<T>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as T;
  } catch {
    return null;
  }
}
