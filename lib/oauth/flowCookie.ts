import "server-only";
import { signToken, verifyToken } from "@/lib/sessionToken";

// The in-flight OAuth attempt (state, PKCE verifier, nonce, what it's for)
// lives in a short-lived, signed, httpOnly cookie scoped to the callback
// path — never in the database and never readable by page scripts.

export const OAUTH_COOKIE = "dah_oauth_google";
export const OAUTH_COOKIE_PATH = "/api/auth/google";
export const OAUTH_COOKIE_SECONDS = 10 * 60;

export type OAuthFlow = {
  state: string;
  verifier: string;
  nonce: string;
  intent: "login" | "link";
  vendorId?: string;
  next?: string;
};

export function signFlow(flow: OAuthFlow) {
  return signToken({ oauth: "google", ...flow }, OAUTH_COOKIE_SECONDS);
}

export async function readFlow(token: string | undefined): Promise<OAuthFlow | null> {
  if (!token) return null;
  const payload = await verifyToken<OAuthFlow & { oauth?: string }>(token);
  if (!payload || payload.oauth !== "google" || !payload.state || !payload.verifier || !payload.nonce) return null;
  if (payload.intent !== "login" && payload.intent !== "link") return null;
  return payload;
}

export const flowCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: OAUTH_COOKIE_PATH,
  maxAge: OAUTH_COOKIE_SECONDS,
};
