import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { streamPrivateDocument } from "@/lib/privateDocs";

// The vendor's own trade licence file — always resolved from the
// authenticated session, never from a client-supplied vendor id, so a
// vendor can only ever fetch their own document this way.
export async function GET() {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId }, select: { tradeLicenseFileUrl: true } });
  if (!vendor?.tradeLicenseFileUrl) return NextResponse.json({ error: "No trade licence on file." }, { status: 404 });

  return streamPrivateDocument(vendor.tradeLicenseFileUrl);
}
