import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { isPhoneVerified } from "@/lib/verification";
import { maskPhoneForDisplay, normalizePhoneToE164 } from "@/lib/phone";

// Lightweight status endpoint for PhoneVerifyModal — lets it show the
// current masked number and know immediately if the phone is already
// verified (e.g. reopened after a previous session, or verified by Admin
// in the meantime) without requiring a fresh SMS send. Phone is the only
// verification concept left that anything reads server-side; email is a
// normal account field now, never polled for a "verified" status.
export async function GET() {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Always normalize before masking — vendor.phone is normalized E.164 in
  // every normal write path, but masking is a display helper that
  // shouldn't silently fall back to showing a raw, unmasked number.
  const normalizedPhone = normalizePhoneToE164(vendor.phone);

  return NextResponse.json({
    phoneMasked: normalizedPhone ? maskPhoneForDisplay(normalizedPhone) : null,
    phoneVerified: isPhoneVerified(vendor),
  });
}
