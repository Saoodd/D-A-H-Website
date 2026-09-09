import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { vendorLoginSchema } from "@/lib/validation";
import { verifyPassword, createVendorSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { normalizeUsername } from "@/lib/username";

const GENERIC_ERROR = "Incorrect email/username or password.";

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  // Keyed on IP only, same as before — works identically regardless of
  // which identifier type (email or username) is being attempted.
  if (!rateLimit(`vendor-login:${ip}`, 10, 10 * 60 * 1000)) {
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
  const vendor = identifier.includes("@")
    ? await prisma.vendor.findUnique({ where: { email: identifier.toLowerCase() } })
    : await prisma.vendor.findUnique({ where: { usernameLower: normalizeUsername(identifier) } });

  if (!vendor || vendor.accountStatus !== "ACTIVE" || !(await verifyPassword(parsed.data.password, vendor.passwordHash))) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  await createVendorSession(vendor.id);
  return NextResponse.json({ ok: true });
}
