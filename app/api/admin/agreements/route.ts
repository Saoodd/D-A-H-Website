import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getPublishedAgreement, getDraftAgreement, getVersionHistory, ensureVendorTermsExist, type AgreementType } from "@/lib/agreements";

function parseScope(req: NextRequest): { type: AgreementType; eventId: string | null } | null {
  const type = req.nextUrl.searchParams.get("type");
  const eventId = req.nextUrl.searchParams.get("eventId");
  if (type !== "VENDOR_TERMS" && type !== "EVENT_TERMS") return null;
  if (type === "VENDOR_TERMS") return { type, eventId: null };
  if (!eventId) return null;
  return { type, eventId };
}

// Current state for one agreement scope (account-wide Vendor Terms, or one
// event's Terms): the live published version, any in-progress draft, and
// the full version history with acceptance counts.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = parseScope(req);
  if (!scope) return NextResponse.json({ error: "Invalid scope" }, { status: 400 });

  if (scope.type === "VENDOR_TERMS") await ensureVendorTermsExist();

  if (scope.eventId) {
    const event = await prisma.event.findUnique({ where: { id: scope.eventId }, select: { id: true, name: true } });
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const [published, draft, history] = await Promise.all([
    getPublishedAgreement(scope.type, scope.eventId),
    getDraftAgreement(scope.type, scope.eventId),
    getVersionHistory(scope.type, scope.eventId),
  ]);

  return NextResponse.json({
    published,
    draft,
    history: history.map((h) => ({
      id: h.id,
      version: h.version,
      title: h.title,
      bodyHtml: h.bodyHtml,
      status: h.status,
      publishedAt: h.publishedAt,
      createdAt: h.createdAt,
      acceptanceCount: h._count.acceptances,
    })),
  });
}
