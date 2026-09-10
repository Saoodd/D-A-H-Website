import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { streamPrivateDocument } from "@/lib/privateDocs";

// Admin's view of any single vendor's trade licence — gated by admin auth,
// same private-Blob streaming as the vendor's own copy, so the two can
// never see mismatched content and the raw Blob URL is never exposed.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id }, select: { tradeLicenseFileUrl: true } });
  if (!vendor?.tradeLicenseFileUrl) return NextResponse.json({ error: "No trade licence on file." }, { status: 404 });

  return streamPrivateDocument(vendor.tradeLicenseFileUrl);
}
