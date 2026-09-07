import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ boothId: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { boothId } = await params;
  const body = await req.json().catch(() => ({}));
  const applicationId = body.applicationId as string | undefined;

  const booth = await prisma.booth.findUnique({ where: { id: boothId } });
  if (!booth) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const application = await prisma.application.findUnique({ where: { id: booth.heldByApplicationId ?? "" } });
  const owns =
    booth.heldByApplicationId &&
    booth.heldByApplicationId === applicationId &&
    application?.vendorId === session.vendorId;

  if (!owns) return NextResponse.json({ error: "Not your hold" }, { status: 403 });

  await prisma.booth.update({
    where: { id: boothId },
    data: { status: "AVAILABLE", holdStage: null, holdExpiresAt: null, heldByApplicationId: null },
  });

  return NextResponse.json({ ok: true });
}
