import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { retryFailedRecipients } from "@/lib/communications/service";

// Retry Failed — ONLY recipients whose last attempt genuinely FAILED (a
// transient provider error), never SKIPPED rows with a permanent reason
// (no email, no WhatsApp opt-in, invalid phone) and never rows that
// already succeeded. See lib/communications/service.ts retryFailedRecipients.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const result = await retryFailedRecipients(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
