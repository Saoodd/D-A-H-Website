import { NextRequest, NextResponse } from "next/server";
import { getVendorSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { safeInternalPath } from "@/lib/url";
import { authorizationUrl, googleSignInEnabled, newAuthAttempt } from "@/lib/oauth/google";
import { OAUTH_COOKIE, flowCookieOptions, signFlow } from "@/lib/oauth/flowCookie";

// GET /api/auth/google/start?intent=login&next=/vendor/dashboard
// GET /api/auth/google/start?intent=link   (signed-in vendors, from Profile)
export async function GET(req: NextRequest) {
  if (!googleSignInEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await rateLimit(`google-start:${clientIp(req.headers)}`, 20, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const intent = req.nextUrl.searchParams.get("intent") === "link" ? "link" : "login";
  let vendorId: string | undefined;
  if (intent === "link") {
    const session = await getVendorSession();
    if (!session) return NextResponse.redirect(new URL("/vendor/login?next=/vendor/profile", req.url));
    vendorId = session.vendorId;
  }
  const next = intent === "login" ? safeInternalPath(req.nextUrl.searchParams.get("next") ?? undefined, "/vendor/dashboard") : undefined;

  const attempt = newAuthAttempt();
  const res = NextResponse.redirect(authorizationUrl(attempt));
  res.cookies.set(OAUTH_COOKIE, await signFlow({ ...attempt, intent, vendorId, next }), flowCookieOptions);
  return res;
}
