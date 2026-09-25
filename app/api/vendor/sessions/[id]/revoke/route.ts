import { NextResponse } from "next/server";
import { getVendorSession, revokeVendorSession, destroyVendorSession } from "@/lib/auth";

// Signs out one of the signed-in vendor's own sessions (Profile → Active
// sessions). Revoking the current session is the same as signing out.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  if (id === session.sessionId) {
    await destroyVendorSession();
    return NextResponse.json({ ok: true, signedOut: true });
  }
  // Scoped to this vendor inside revokeVendorSession: another vendor's
  // session id simply matches nothing.
  const revoked = await revokeVendorSession(session.vendorId, id);
  if (!revoked) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
