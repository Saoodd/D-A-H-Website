import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";
import { sendCancellationRequestedAdminEmail } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { applicationId } = await params;
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { event: true, assignedBooths: true },
  });
  if (!application || application.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const soldBooth = application.assignedBooths.find((b) => b.status === "SOLD");
  if (!soldBooth) {
    return NextResponse.json({ error: "No confirmed booking to cancel." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || "").trim() || "No reason given";

  await prisma.cancellationRequest.create({
    data: { applicationId, reason, status: "PENDING" },
  });

  await sendCancellationRequestedAdminEmail({
    businessName: application.businessName,
    eventName: application.event.name,
    boothCode: soldBooth.code,
    reason,
  });

  return NextResponse.json({ ok: true });
}
