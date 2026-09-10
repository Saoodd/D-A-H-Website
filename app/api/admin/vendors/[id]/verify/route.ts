import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { sendVendorVerifiedEmail } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const verified = !!body.verified;

  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.vendor.update({ where: { id }, data: { verified } });

  if (verified && !vendor.verified) {
    await sendVendorVerifiedEmail({ vendorId: vendor.id, vendorEmail: vendor.email, businessName: vendor.businessName });
  }

  return NextResponse.json({ ok: true, vendor: updated });
}
