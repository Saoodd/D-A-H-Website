import { NextResponse } from "next/server";
import { getVendorSession, revokeOtherVendorSessions } from "@/lib/auth";

// "Sign out of all other devices" — keeps only the session making this
// request.
export async function POST() {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const count = await revokeOtherVendorSessions(session.vendorId, session.sessionId);
  return NextResponse.json({ ok: true, count });
}
