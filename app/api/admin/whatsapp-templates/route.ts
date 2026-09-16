import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { isWhatsAppConfigured, listWhatsAppTemplates, WHATSAPP_NOT_CONFIGURED_MESSAGE } from "@/lib/whatsapp/infobip";

// Live-syncs Infobip's real approved WhatsApp templates (never a hardcoded
// list — see lib/whatsapp/infobip.ts) into WhatsAppTemplateCache, then
// returns the merged cache: SYNCED rows (Infobip's real templates, minus
// AUTHENTICATION-category ones — OTP must never appear as a broadcast
// template) plus any MANUAL fallback rows an admin registered by hand.
// Runs the sync on every GET (cheap, and keeps the picker current) —
// there's also a dedicated POST /sync for an explicit "Refresh" action.
async function syncAndList() {
  if (!isWhatsAppConfigured()) {
    const manual = await prisma.whatsAppTemplateCache.findMany({ where: { source: "MANUAL" }, orderBy: { name: "asc" } });
    return { configured: false, error: WHATSAPP_NOT_CONFIGURED_MESSAGE, templates: manual };
  }

  const result = await listWhatsAppTemplates();
  if (!result.ok) {
    const cached = await prisma.whatsAppTemplateCache.findMany({ orderBy: { name: "asc" } });
    return { configured: true, error: result.error, templates: cached.filter((t) => !t.isAuthTemplate) };
  }

  for (const t of result.templates) {
    await prisma.whatsAppTemplateCache.upsert({
      where: { name_language: { name: t.name, language: t.language } },
      update: { category: t.category, status: t.status, bodyText: t.bodyText, variableCount: t.variableCount, isAuthTemplate: t.isAuthTemplate, source: "SYNCED", syncedAt: new Date() },
      create: { name: t.name, language: t.language, category: t.category, status: t.status, bodyText: t.bodyText, variableCount: t.variableCount, isAuthTemplate: t.isAuthTemplate, source: "SYNCED" },
    });
  }

  const merged = await prisma.whatsAppTemplateCache.findMany({ orderBy: { name: "asc" } });
  return { configured: true, error: null, templates: merged.filter((t) => !t.isAuthTemplate) };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await syncAndList();
  return NextResponse.json({ ok: true, ...result });
}

// Registers a MANUAL fallback template (admin already knows a real
// approved name/language/body but the live Infobip sync couldn't be used —
// e.g. not configured yet, or an unrecognized response shape). Always
// clearly flagged source="MANUAL" in the picker — never presented as
// "Approved" the way a SYNCED row is, since Infobip never confirmed it.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const language = String(body.language || "").trim();
  const bodyText = String(body.bodyText || "").trim();
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : null;
  if (!name || !language || !bodyText) {
    return NextResponse.json({ error: "Template name, language, and body text are required." }, { status: 400 });
  }
  if (category?.toUpperCase() === "AUTHENTICATION") {
    return NextResponse.json({ error: "Authentication/OTP templates can't be registered as a broadcast template." }, { status: 400 });
  }
  const variableCount = new Set((bodyText.match(/\{\{\s*\d+\s*\}\}/g) || [])).size;

  const template = await prisma.whatsAppTemplateCache.upsert({
    where: { name_language: { name, language } },
    update: { bodyText, category, variableCount, source: "MANUAL", isAuthTemplate: false, syncedAt: new Date() },
    create: { name, language, bodyText, category, variableCount, source: "MANUAL", isAuthTemplate: false },
  });

  return NextResponse.json({ ok: true, template });
}
