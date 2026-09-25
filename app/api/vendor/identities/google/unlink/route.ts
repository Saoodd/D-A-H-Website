import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";

// Removes the vendor's linked Google sign-in. Always safe: every vendor
// account keeps its password, so unlinking can never lock anyone out.
export async function POST() {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  await prisma.vendorIdentity.deleteMany({ where: { vendorId: session.vendorId, provider: "google" } });
  return NextResponse.json({ ok: true });
}
