import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { fetchRawTemplateList } from "@/lib/whatsapp/infobip";

// Diagnostic-only — returns Infobip's template-list response completely
// unparsed, so a real shape mismatch (e.g. every synced template showing
// 0 variables) can be root-caused from an actual production response
// instead of guessed at again. Never used by any send/sync path. No
// secrets in the response body itself (template content isn't
// sensitive) — still admin-gated like every other WhatsApp admin route.
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await fetchRawTemplateList();
  if (!result.ok) return NextResponse.json({ ok: false, code: result.code, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, raw: result.raw });
}
