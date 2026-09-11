import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { normalizePhoneToE164 } from "@/lib/phone";
import { isPhoneVerified } from "@/lib/verification";

// Admin-only manual phone verification — bypasses Twilio Verify entirely
// for cases where SMS genuinely can't reach a vendor. Gated by
// requireAdmin() alone: a vendor's own session cookie is a completely
// different, unrelated auth mechanism (getVendorSession()), so there is no
// path by which a vendor can call this route and verify themselves.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (isPhoneVerified(vendor)) {
    return NextResponse.json({ error: "This phone number is already verified." }, { status: 409 });
  }

  const normalizedPhone = normalizePhoneToE164(vendor.phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: "This vendor's phone number isn't valid — ask them to update it in Profile first." }, { status: 400 });
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.vendor.update({
      where: { id },
      data: { phoneVerifiedAt: now, phoneVerifiedNumber: normalizedPhone, phoneVerifiedMethod: "ADMIN" },
    }),
    // Append-only audit trail — kept even if a later phone change or
    // re-verification supersedes this row, so the full verification
    // history for this vendor is always reconstructable.
    prisma.vendorPhoneVerificationLog.create({
      data: { vendorId: id, phone: normalizedPhone, method: "ADMIN" },
    }),
  ]);

  return NextResponse.json({ ok: true, vendor: updated });
}
