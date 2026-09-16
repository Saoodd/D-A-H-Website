import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";

// Admin-only manual WhatsApp opt-in/opt-out — there is no in-app vendor
// self-service opt-in flow yet (no WhatsApp integration existed before
// this Communications Center; see Vendor.whatsappOptInAt in schema.prisma
// for why "ADMIN" is the only method recorded today). Gated by
// requireAdmin() alone, same pattern as verify-phone — a vendor session
// can never call this.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const optedIn = body.optedIn === true;

  const now = new Date();
  const updated = await prisma.vendor.update({
    where: { id },
    data: optedIn
      ? { whatsappOptInAt: now, whatsappOptInMethod: "ADMIN", whatsappOptOutAt: null }
      : { whatsappOptOutAt: now },
  });

  return NextResponse.json({ ok: true, vendor: updated });
}
