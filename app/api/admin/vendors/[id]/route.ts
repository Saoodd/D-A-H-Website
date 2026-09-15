import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { permanentlyRemoveVendor, VendorAlreadyDeletedError } from "@/lib/vendorDeletion";

// Permanent, irreversible vendor removal — Admin → Vendors → Vendor Profile
// → Danger Zone only. Gated by requireAdmin() alone, structurally
// independent from vendor session auth: there is no path by which a vendor
// can reach this route with their own session. Works even on a vendor who
// already self-closed (accountStatus CLOSED) — closing your own account is
// not a way to dodge permanent removal, and isn't required first either.
//
// The typed "DELETE" confirmation is checked here too, not just in the
// admin UI — the client-side modal gating the button is a UX affordance,
// never the real guarantee for an action this irreversible.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  if (!json || typeof json.confirmation !== "string" || json.confirmation !== "DELETE") {
    return NextResponse.json({ error: 'Type "DELETE" to confirm.' }, { status: 400 });
  }

  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await permanentlyRemoveVendor(id);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof VendorAlreadyDeletedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
