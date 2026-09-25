import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { createVendorSession, getVendorSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { safeInternalPath } from "@/lib/url";
import { exchangeCode, googleSignInEnabled } from "@/lib/oauth/google";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, readFlow } from "@/lib/oauth/flowCookie";

// Google redirects here after the account chooser. Every outcome ends in a
// redirect back to a DAH page with a short `?google=` status code that page
// turns into a message.
//
// Linking rules (see VendorIdentity in the schema):
// - intent "link": only for the same signed-in vendor who started it. A
//   Google account already linked to a different DAH account is refused.
// - intent "login": only succeeds when this Google account is already
//   linked. Never creates an account, never matches by email.

function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  if (!googleSignInEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const flow = await readFlow(req.cookies.get(OAUTH_COOKIE)?.value);
  const back = (path: string, status: string) => {
    const url = new URL(path, req.url);
    url.searchParams.set("google", status);
    const res = NextResponse.redirect(url);
    res.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return res;
  };
  const fallback = flow?.intent === "link" ? "/vendor/profile" : "/vendor/login";

  if (!(await rateLimit(`google-callback:${clientIp(req.headers)}`, 20, 10 * 60 * 1000))) return back(fallback, "failed");

  const params = req.nextUrl.searchParams;
  const state = params.get("state");
  const code = params.get("code");
  // No/expired flow cookie or mismatched state: a stale tab, a replayed
  // callback, or a forged request. Treat all the same.
  if (!flow || !state || !equal(state, flow.state)) return back(fallback, "failed");
  if (params.get("error")) return back(fallback, "cancelled");
  if (!code) return back(fallback, "failed");

  let identity;
  try {
    identity = await exchangeCode(code, flow.verifier, flow.nonce);
  } catch (err) {
    console.error("[google-oauth] code exchange/verification failed:", err instanceof Error ? err.message : err);
    return back(fallback, "failed");
  }

  const existing = await prisma.vendorIdentity.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: identity.sub } },
    include: { vendor: { select: { id: true, accountStatus: true } } },
  });

  if (flow.intent === "link") {
    const session = await getVendorSession();
    if (!session || session.vendorId !== flow.vendorId) return back("/vendor/profile", "failed");
    if (existing) {
      return back("/vendor/profile", existing.vendorId === session.vendorId ? "linked" : "taken");
    }
    const already = await prisma.vendorIdentity.findUnique({ where: { vendorId_provider: { vendorId: session.vendorId, provider: "google" } } });
    if (already) return back("/vendor/profile", "already");
    try {
      await prisma.vendorIdentity.create({
        data: { vendorId: session.vendorId, provider: "google", providerAccountId: identity.sub, email: identity.email },
      });
    } catch {
      // Unique constraint lost a race with another link of the same account.
      return back("/vendor/profile", "taken");
    }
    return back("/vendor/profile", "linked");
  }

  if (!existing) return back("/vendor/login", "not_linked");
  if (existing.vendor.accountStatus !== "ACTIVE") return back("/vendor/login", "failed");

  await prisma.vendorIdentity.update({ where: { id: existing.id }, data: { lastUsedAt: new Date(), email: identity.email ?? existing.email } });
  await createVendorSession(existing.vendorId);
  const res = NextResponse.redirect(new URL(safeInternalPath(flow.next, "/vendor/dashboard"), req.url));
  res.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
  return res;
}
