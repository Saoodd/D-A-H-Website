import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { vendorProfileUpdateSchema } from "@/lib/validation";
import { getVendorParticipation, computeProfileCompletion } from "@/lib/vendorStats";
import { normalizePhoneToE164 } from "@/lib/phone";

// Always resolves the vendor from the authenticated session cookie — a
// vendor can only ever read or write their OWN profile, never one supplied
// by the client.
export async function GET() {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [participation, applicationsCount, settings] = await Promise.all([
    getVendorParticipation(vendor.id),
    prisma.application.count({ where: { vendorId: vendor.id } }),
    getSettings(),
  ]);
  const completion = computeProfileCompletion(vendor as unknown as Record<string, unknown>, {
    tradeLicenseRequired: settings.tradeLicenseRequired,
  });

  const { passwordHash: _passwordHash, ...safeVendor } = vendor;
  void _passwordHash;

  return NextResponse.json({
    vendor: safeVendor,
    stats: {
      eventsParticipated: participation.eventsParticipated,
      upcomingConfirmedCount: participation.upcomingConfirmedCount,
      applicationsCount,
      memberSince: vendor.createdAt,
    },
    profileCompletion: completion,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const json = await req.json().catch(() => null);
  if (!json) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = vendorProfileUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const data = parsed.data;

  const update: Record<string, unknown> = {};
  if (data.businessName !== undefined) update.businessName = data.businessName;
  if (data.contactName !== undefined) update.contactName = data.contactName;
  if (data.phone !== undefined) {
    // A proven parsing library, same as signup — never a handwritten
    // regex. Storing the normalized E.164 form (rather than whatever the
    // vendor typed) is also what lets isPhoneVerified() detect a real
    // number change vs. the same number retyped/reformatted, so editing
    // the phone here immediately falls back to Unverified only when it
    // actually changed (PART 14).
    const normalized = normalizePhoneToE164(data.phone);
    if (!normalized) {
      return NextResponse.json({ error: "Please enter a valid mobile number, including country code." }, { status: 400 });
    }
    update.phone = normalized;
  }
  if (data.category !== undefined) update.category = data.category;
  if (data.instagram !== undefined) update.instagram = data.instagram || null;
  if (data.website !== undefined) update.website = data.website || null;
  if (data.description !== undefined) update.description = data.description || "";
  if (data.logoUrl !== undefined) update.logoUrl = data.logoUrl || null;
  if (data.tradeLicenseNumber !== undefined) update.tradeLicenseNumber = data.tradeLicenseNumber || null;
  if (data.tradeLicenseFileUrl !== undefined) update.tradeLicenseFileUrl = data.tradeLicenseFileUrl || null;
  if (data.tradeLicenseExpiry !== undefined) {
    update.tradeLicenseExpiry = data.tradeLicenseExpiry ? new Date(data.tradeLicenseExpiry) : null;
  }

  const vendor = await prisma.vendor.update({ where: { id: session.vendorId }, data: update });
  const { passwordHash: _passwordHash, ...safeVendor } = vendor;
  void _passwordHash;

  return NextResponse.json({ ok: true, vendor: safeVendor });
}
