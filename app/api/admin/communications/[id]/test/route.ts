import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { normalizePhoneToE164 } from "@/lib/phone";
import { sendTestCommunication } from "@/lib/communications/service";

// Send Test — never touches CommunicationRecipient, never counted in
// delivery stats, never sent to a real vendor. Uses the SAME rendering
// path (variable substitution, sanitization, WhatsApp template) as a real
// send, so what Admin sees is genuinely what would go out.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const testEmail = typeof body.testEmail === "string" && body.testEmail.trim() ? body.testEmail.trim() : undefined;
  const testPhoneRaw = typeof body.testPhone === "string" && body.testPhone.trim() ? body.testPhone.trim() : undefined;
  const testPhoneE164 = testPhoneRaw ? (normalizePhoneToE164(testPhoneRaw) ?? undefined) : undefined;
  if (testPhoneRaw && !testPhoneE164) {
    return NextResponse.json({ error: "That test phone number doesn't look valid." }, { status: 400 });
  }
  if (!testEmail && !testPhoneE164) {
    return NextResponse.json({ error: "Enter a test email and/or test phone number." }, { status: 400 });
  }

  const result = await sendTestCommunication(id, { testEmail, testPhoneE164 });
  return NextResponse.json({ ok: result.ok, email: result.email, whatsapp: result.whatsapp });
}
