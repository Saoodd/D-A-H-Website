import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { sendCommunication } from "@/lib/communications/service";

// The real send. Admin-only (requireAdmin — a vendor session can never
// satisfy this, it's a completely separate cookie/guard). Safe to call
// more than once for the same communication id — sendCommunication()'s
// DRAFT->SENDING compare-and-swap plus per-recipient/per-provider dedupe
// keys mean a double-click, a page refresh mid-send, or a client retry
// after a timeout can never result in the same recipient being messaged
// twice. See lib/communications/service.ts for the full safety design.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await sendCommunication(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
