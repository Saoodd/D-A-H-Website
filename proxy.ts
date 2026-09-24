import { NextRequest, NextResponse } from "next/server";
import { VENDOR_COOKIE, verifyToken } from "@/lib/sessionToken";

// Central gate for signed-in-only vendor pages (Next 16 "proxy", formerly
// middleware). Admin pages are already gated structurally by
// app/admin/(protected)/layout.tsx; vendor pages share their folder with
// public ones (login, password reset, email-confirmation links), so until
// now each private page had to remember its own check.
//
// This is an optimistic check only — a valid, unexpired signature on the
// session cookie — per Next's guidance for proxies. It does NOT replace the
// per-page getVendorSession() database check (revoked sessions, closed
// accounts), which every page keeps. Its job is to make a future page added
// under these paths private by default.
//
// API routes are deliberately not matched: they answer 401 JSON themselves.

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(VENDOR_COOKIE)?.value;
  const payload = token ? await verifyToken<{ vendorId?: string; sid?: string }>(token) : null;
  if (payload?.vendorId && payload.sid) return NextResponse.next();

  const login = new URL("/vendor/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // `/vendor/profile` is matched exactly: /vendor/profile/confirm-email is
  // an emailed link that must work without a session. Public vendor pages
  // (login, forgot-*, reset-password, verify, verify/email) are not listed.
  matcher: [
    "/vendor/dashboard/:path*",
    "/vendor/applications/:path*",
    "/vendor/payments/:path*",
    "/vendor/agreements/:path*",
    "/vendor/receipts/:path*",
    "/vendor/profile",
  ],
};
