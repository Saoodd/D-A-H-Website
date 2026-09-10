import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { isEmailVerified, isPhoneVerified } from "@/lib/verification";
import { maskPhoneForDisplay } from "@/lib/phone";

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

  return NextResponse.json({
    email: vendor.email,
    emailVerified: isEmailVerified(vendor),
    phoneMasked: maskPhoneForDisplay(vendor.phone),
    phoneVerified: isPhoneVerified(vendor),
  });
}
