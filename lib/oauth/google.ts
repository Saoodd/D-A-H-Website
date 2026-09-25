import "server-only";
import { createHash, randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { trustedSiteUrl } from "@/lib/url";

// "Sign in with Google" for EXISTING vendor accounts — OpenID Connect
// authorization-code flow with PKCE, state and nonce. See
// app/api/auth/google/* for the routes and VendorIdentity (schema) for the
// linking rules.
//
// Endpoints are Google's published OIDC endpoints
// (https://accounts.google.com/.well-known/openid-configuration).
// Setup: create an OAuth client ("Web application") in Google Cloud
// Console, add the redirect URI printed by googleRedirectUri() — i.e.
// <NEXT_PUBLIC_SITE_URL>/api/auth/google/callback — and set
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Without both, the feature is
// off: no button is shown and the routes answer 404.

interface Endpoints {
  issuer: string[];
  authorization: string;
  token: string;
  jwks: string;
}

const GOOGLE: Endpoints = {
  issuer: ["https://accounts.google.com", "accounts.google.com"],
  authorization: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  jwks: "https://www.googleapis.com/oauth2/v3/certs",
};

/** Local-testing seam: outside production, GOOGLE_OAUTH_DEV_ISSUER_URL
 *  points the whole flow at a fake OIDC issuer (serving /auth, /token and
 *  /certs) so it can be exercised end to end without real Google
 *  credentials. Ignored entirely in production builds. */
function endpoints(): Endpoints {
  const dev = process.env.NODE_ENV !== "production" ? process.env.GOOGLE_OAUTH_DEV_ISSUER_URL : undefined;
  if (!dev) return GOOGLE;
  const base = dev.replace(/\/+$/, "");
  return { issuer: [base], authorization: `${base}/auth`, token: `${base}/token`, jwks: `${base}/certs` };
}

export function googleSignInEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return `${trustedSiteUrl()}/api/auth/google/callback`;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Fresh per-attempt secrets: `state` (CSRF), PKCE verifier, and `nonce`
 *  (binds the ID token to this attempt). */
export function newAuthAttempt() {
  return { state: b64url(randomBytes(24)), verifier: b64url(randomBytes(32)), nonce: b64url(randomBytes(24)) };
}

export function authorizationUrl(attempt: { state: string; verifier: string; nonce: string }): string {
  const url = new URL(endpoints().authorization);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", attempt.state);
  url.searchParams.set("nonce", attempt.nonce);
  url.searchParams.set("code_challenge", b64url(createHash("sha256").update(attempt.verifier).digest()));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

let jwks: { url: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null;

export type GoogleIdentity = { sub: string; email: string | null };

/** Exchanges the authorization code (server to server, with the client
 *  secret and PKCE verifier) and verifies the returned ID token's
 *  signature, issuer, audience, expiry and nonce. Throws on any failure. */
export async function exchangeCode(code: string, verifier: string, nonce: string): Promise<GoogleIdentity> {
  const ep = endpoints();
  const res = await fetch(ep.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("no id_token");

  if (!jwks || jwks.url !== ep.jwks) jwks = { url: ep.jwks, set: createRemoteJWKSet(new URL(ep.jwks)) };
  const { payload } = await jwtVerify(body.id_token, jwks.set, {
    issuer: ep.issuer,
    audience: process.env.GOOGLE_CLIENT_ID!,
  });
  if (payload.nonce !== nonce) throw new Error("nonce mismatch");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("no sub");
  const email = typeof payload.email === "string" && payload.email_verified === true ? payload.email : null;
  return { sub: payload.sub, email };
}
