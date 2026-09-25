import { NextResponse } from "next/server";
import { getAdminSessionId, revokeOtherAdminSessions } from "@/lib/auth";

// Signs out every other admin session. Useful after the admin password is
// changed, since sessions are otherwise valid for up to 12 hours.
export async function POST() {
  const current = await getAdminSessionId();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const count = await revokeOtherAdminSessions(current);
  return NextResponse.json({ ok: true, count });
}
