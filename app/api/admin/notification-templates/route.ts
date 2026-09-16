import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { syncAndListTemplates } from "@/lib/whatsapp/templateSync";
import { NOTIFICATION_USE_CASES, NOTIFICATION_USE_CASE_LABELS, type NotificationUseCase } from "@/lib/notifications/useCases";
import type { WhatsAppVariableMapping } from "@/lib/communications/variables";

// The Template Registry — where an admin discovers their account's REAL
// approved WhatsApp templates (live-synced, same mechanism the
// Communications Center's picker uses) and maps each of DAH's fixed
// notification use cases to one of them. This app never guesses which
// real template name fulfills "APPLICATION_ACCEPTED" etc.
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ configured, error, templates }, mappings] = await Promise.all([
    syncAndListTemplates(),
    prisma.whatsAppNotificationTemplate.findMany(),
  ]);

  const mappingByUseCase = new Map(mappings.map((m) => [m.useCase, m]));
  const useCases = NOTIFICATION_USE_CASES.map((useCase) => {
    const m = mappingByUseCase.get(useCase);
    return {
      useCase,
      label: NOTIFICATION_USE_CASE_LABELS[useCase],
      mapped: m
        ? {
            templateName: m.templateName,
            templateLanguage: m.templateLanguage,
            enabled: m.enabled,
            placeholderMapping: m.placeholderMappingJson ? (JSON.parse(m.placeholderMappingJson) as WhatsAppVariableMapping) : {},
            buttonMapping: m.buttonMappingJson ? (JSON.parse(m.buttonMappingJson) as WhatsAppVariableMapping) : {},
            updatedByName: m.updatedByName,
            updatedAt: m.updatedAt,
          }
        : null,
    };
  });

  return NextResponse.json({ ok: true, configured, error, templates, useCases });
}

function isValidMapping(raw: unknown): raw is WhatsAppVariableMapping {
  if (!raw || typeof raw !== "object") return false;
  return Object.values(raw as Record<string, unknown>).every((v) => {
    if (!v || typeof v !== "object") return false;
    const entry = v as Record<string, unknown>;
    if (entry.kind === "literal") return typeof entry.value === "string";
    if (entry.kind === "field") return typeof entry.field === "string";
    return false;
  });
}

// Saves (upserts) which real template fulfills one use case, plus its
// placeholder/button mapping. Never blocks on the template's live
// approval status here — a mapping can be prepared before Meta approves a
// template; lib/whatsapp/notificationRegistry.ts enforces APPROVED at
// SEND time, same as the OTP auth-template check.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const useCase = String(body.useCase || "");
  if (!NOTIFICATION_USE_CASES.includes(useCase as NotificationUseCase)) {
    return NextResponse.json({ error: "Unknown use case." }, { status: 400 });
  }
  const templateName = String(body.templateName || "").trim();
  const templateLanguage = String(body.templateLanguage || "").trim();
  if (!templateName || !templateLanguage) {
    return NextResponse.json({ error: "Select a template first." }, { status: 400 });
  }

  const cached = await prisma.whatsAppTemplateCache.findUnique({ where: { name_language: { name: templateName, language: templateLanguage } } });
  if (!cached) {
    return NextResponse.json({ error: "That template isn't in the synced list — refresh and try again." }, { status: 400 });
  }
  if (cached.isAuthTemplate) {
    return NextResponse.json({ error: "The Authentication/OTP template can't be used for a Utility notification." }, { status: 400 });
  }

  const placeholderMapping = body.placeholderMapping;
  const buttonMapping = body.buttonMapping;
  if (placeholderMapping !== undefined && placeholderMapping !== null && !isValidMapping(placeholderMapping)) {
    return NextResponse.json({ error: "Invalid placeholder mapping." }, { status: 400 });
  }
  if (buttonMapping !== undefined && buttonMapping !== null && !isValidMapping(buttonMapping)) {
    return NextResponse.json({ error: "Invalid button mapping." }, { status: 400 });
  }

  const enabled = body.enabled !== false;
  const updatedByName = typeof body.updatedByName === "string" && body.updatedByName.trim() ? body.updatedByName.trim() : null;

  const saved = await prisma.whatsAppNotificationTemplate.upsert({
    where: { useCase },
    update: {
      templateName,
      templateLanguage,
      placeholderMappingJson: placeholderMapping ? JSON.stringify(placeholderMapping) : null,
      buttonMappingJson: buttonMapping ? JSON.stringify(buttonMapping) : null,
      enabled,
      updatedByName,
    },
    create: {
      useCase,
      templateName,
      templateLanguage,
      placeholderMappingJson: placeholderMapping ? JSON.stringify(placeholderMapping) : null,
      buttonMappingJson: buttonMapping ? JSON.stringify(buttonMapping) : null,
      enabled,
      updatedByName,
    },
  });

  return NextResponse.json({ ok: true, mapping: saved });
}

// Clears a use case's mapping entirely (goes back to "Not configured" —
// notifyVendorWhatsApp then returns NOT_CONFIGURED and sends nothing).
export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const useCase = req.nextUrl.searchParams.get("useCase") || "";
  if (!NOTIFICATION_USE_CASES.includes(useCase as NotificationUseCase)) {
    return NextResponse.json({ error: "Unknown use case." }, { status: 400 });
  }
  await prisma.whatsAppNotificationTemplate.deleteMany({ where: { useCase } });
  return NextResponse.json({ ok: true });
}
