import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { vendorLoginSchema } from "@/lib/validation";
import { verifyPasswordOrDummy, createVendorSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { normalizeUsername } from "@/lib/username";

const GENERIC_ERROR = "Incorrect email/username or password.";

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  // Keyed on IP only, same as before — works identically regardless of
  // which identifier type (email or username) is being attempted.
  if (!(await rateLimit(`vendor-login:${ip}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = vendorLoginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  // Decide by shape: an "@" means email, anything else is a username. The
  // lookup itself, and the error on failure, are identical either way —
  // never reveal which identifier type was tried or whether it exists.
  const identifier = parsed.data.identifier;
  const normalizedIdentifier = identifier.includes("@") ? identifier.toLowerCase() : normalizeUsername(identifier);

  // Also rate limit per-identifier, independent of IP, so a distributed
  // credential-stuffing attempt against one target account is still capped
  // — matches the same dual-limit pattern already used on password reset,
  // username recovery, email change and account deletion.
  if (!(await rateLimit(`vendor-login-id:${normalizedIdentifier}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const vendor = identifier.includes("@")
    ? await prisma.vendor.findUnique({ where: { email: normalizedIdentifier } })
    : await prisma.vendor.findUnique({ where: { usernameLower: normalizedIdentifier } });

  // verifyPasswordOrDummy always runs a real bcrypt.compare — against the
  // real hash when the account exists, against a fixed dummy hash when it
  // doesn't — so a nonexistent identifier takes the same time to reject as
  // a wrong password, and the response can never be timed to enumerate
  // registered accounts.
  const passwordOk = await verifyPasswordOrDummy(parsed.data.password, vendor?.passwordHash ?? null);
  if (!vendor || vendor.accountStatus !== "ACTIVE" || !passwordOk) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  await createVendorSession(vendor.id);
  return NextResponse.json({ ok: true });
}
