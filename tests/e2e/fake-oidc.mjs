// A local stand-in for Google's OIDC endpoints (/auth, /token, /certs), for
// tests/e2e/google-signin.e2e.ts only. The app uses it when a NON-production
// server has GOOGLE_OAUTH_DEV_ISSUER_URL set (lib/oauth/google.ts); it checks
// PKCE, client secret and redirect URI, and signs real RS256 ID tokens.
// Test control: GET /set?sub=...&email=...&mode=ok|deny|badnonce
// Accepts client secret "test-secret" only.
import http from "node:http";
import { createHash } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
const PORT = Number(process.env.FAKE_OIDC_PORT || 4555), BASE = `http://localhost:${PORT}`;
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
let nextUser = { sub: "g-user-1", email: "person@gmail.test" }, mode = "ok";
const codes = new Map();
http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  if (url.pathname === "/set") { nextUser = { sub: url.searchParams.get("sub"), email: url.searchParams.get("email") }; mode = url.searchParams.get("mode") || "ok"; return res.end("ok"); }
  if (url.pathname === "/certs") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ keys: [jwk] })); }
  if (url.pathname === "/auth") {
    const p = url.searchParams, cb = new URL(p.get("redirect_uri"));
    if (mode === "deny") { cb.searchParams.set("error", "access_denied"); cb.searchParams.set("state", p.get("state")); }
    else {
      const code = "c" + Math.random().toString(36).slice(2);
      codes.set(code, { ...nextUser, nonce: mode === "badnonce" ? "wrong" : p.get("nonce"), challenge: p.get("code_challenge"), client: p.get("client_id"), redirect: p.get("redirect_uri") });
      cb.searchParams.set("code", code); cb.searchParams.set("state", p.get("state"));
    }
    res.statusCode = 302; res.setHeader("location", cb.toString()); return res.end();
  }
  if (url.pathname === "/token" && req.method === "POST") {
    let body = ""; for await (const c of req) body += c;
    const p = new URLSearchParams(body), entry = codes.get(p.get("code"));
    codes.delete(p.get("code")); // single use
    const fail = (m) => { res.statusCode = 400; res.end(JSON.stringify({ error: m })); };
    if (!entry) return fail("invalid_grant");
    if (p.get("client_secret") !== "test-secret" || p.get("client_id") !== entry.client) return fail("invalid_client");
    if (p.get("redirect_uri") !== entry.redirect) return fail("redirect_mismatch");
    if (createHash("sha256").update(p.get("code_verifier") ?? "").digest("base64url") !== entry.challenge) return fail("pkce");
    const id_token = await new SignJWT({ email: entry.email, email_verified: true, nonce: entry.nonce })
      .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(BASE).setAudience(entry.client).setSubject(entry.sub)
      .setIssuedAt().setExpirationTime("5m").sign(privateKey);
    res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ id_token, access_token: "x", token_type: "Bearer" }));
  }
  res.statusCode = 404; res.end();
}).listen(PORT, () => console.log("fake oidc on", PORT));
