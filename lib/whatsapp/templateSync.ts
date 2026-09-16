import "server-only";
import { prisma } from "../prisma";
import { isWhatsAppConfigured, listWhatsAppTemplates, serializeButtons, WHATSAPP_NOT_CONFIGURED_MESSAGE } from "./infobip";

// The one place that live-syncs Infobip's real WhatsApp templates into
// WhatsAppTemplateCache and returns the merged, non-AUTHENTICATION set —
// shared by the Communications Center's template picker
// (app/api/admin/whatsapp-templates/route.ts) and the automatic-
// notification Template Registry (app/api/admin/notification-templates/
// route.ts), so both admin surfaces are always looking at the exact same
// live-synced data, not two independently-drifting copies.
export async function syncAndListTemplates() {
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
      update: {
        category: t.category,
        status: t.status,
        bodyText: t.bodyText,
        headerText: t.headerText,
        footerText: t.footerText,
        buttonsJson: serializeButtons(t.buttons),
        variableCount: t.variableCount,
        isAuthTemplate: t.isAuthTemplate,
        source: "SYNCED",
        syncedAt: new Date(),
      },
      create: {
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        bodyText: t.bodyText,
        headerText: t.headerText,
        footerText: t.footerText,
        buttonsJson: serializeButtons(t.buttons),
        variableCount: t.variableCount,
        isAuthTemplate: t.isAuthTemplate,
        source: "SYNCED",
      },
    });
  }

  const merged = await prisma.whatsAppTemplateCache.findMany({ orderBy: { name: "asc" } });
  return { configured: true, error: null, templates: merged.filter((t) => !t.isAuthTemplate) };
}
