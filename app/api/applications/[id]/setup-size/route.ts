import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/auth";

const MAX_DIMENSION_MM = 50_000; // 50m — generous upper bound, catches obvious typos (e.g. entering cm as m)

// Sets/edits the vendor's declared setup footprint for THIS application —
// never the vendor's general profile (a vendor may use a different setup
// at different events, and this must be a per-booking snapshot: see
// Application.setupWidthMm/setupDepthMm in schema.prisma). Editable any
// time before the booking is confirmed; once PAID, this becomes historical
// record and this route refuses further changes (see requirement: preserve
// the setup-size snapshot used at booking time).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: applicationId } = await params;
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application || application.vendorId !== session.vendorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const hasPaid = await prisma.payment.findFirst({ where: { applicationId, status: "SUCCEEDED" } });
  if (hasPaid) {
    return NextResponse.json({ error: "This booking is already confirmed — setup size can no longer be changed." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const widthMm = Number(body.widthMm);
  const depthMm = Number(body.depthMm);
  if (!Number.isFinite(widthMm) || !Number.isFinite(depthMm) || widthMm <= 0 || depthMm <= 0 || widthMm > MAX_DIMENSION_MM || depthMm > MAX_DIMENSION_MM) {
    return NextResponse.json({ error: "Please enter valid setup dimensions." }, { status: 400 });
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: { setupWidthMm: Math.round(widthMm), setupDepthMm: Math.round(depthMm) },
  });

  return NextResponse.json({ ok: true });
}
