import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { isEmailVerified, isPhoneVerified } from "@/lib/verification";
import { maskPhoneForDisplay, normalizePhoneToE164 } from "@/lib/phone";

// Lightweight polling endpoint for the Verify Your Account page — lets the
// page pick up "verified" automatically if the vendor confirms the email
// link in a different tab, without a manual refresh (PART 9). Deliberately
// tiny: no tokens, no PII beyond what the vendor's own dashboard already
// shows them.
export async function GET() {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Always normalize before masking — vendor.phone is normalized E.164 in
  // every normal write path (register/profile), but masking is a display
  // helper that shouldn't silently fall back to showing a raw, unmasked
  // number if it ever receives anything else.
  const normalizedPhone = normalizePhoneToE164(vendor.phone);

  return NextResponse.json({
    email: vendor.email,
    emailVerified: isEmailVerified(vendor),
    phoneMasked: normalizedPhone ? maskPhoneForDisplay(normalizedPhone) : null,
    phoneVerified: isPhoneVerified(vendor),
  });
}
