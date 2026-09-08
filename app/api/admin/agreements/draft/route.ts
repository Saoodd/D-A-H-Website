import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getOrCreateDraft } from "@/lib/agreements";

// Starts (or resumes) editing: returns the existing in-progress draft for
// this scope, or creates a new one seeded from the currently published
// text (blank if nothing has ever been published).
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const type = body.type;
  const eventId = body.eventId ? String(body.eventId) : null;

  if (type !== "VENDOR_TERMS" && type !== "EVENT_TERMS") {
    return NextResponse.json({ error: "Invalid agreement type" }, { status: 400 });
  }
  if (type === "EVENT_TERMS" && !eventId) {
    return NextResponse.json({ error: "eventId is required for event terms" }, { status: 400 });
  }

  let defaultTitle = "Dar Al Hay Vendor Terms & Conditions";
  if (type === "EVENT_TERMS") {
    const event = await prisma.event.findUnique({ where: { id: eventId! }, select: { name: true } });
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    defaultTitle = `${event.name} — Vendor Terms & Conditions`;
  }

  const draft = await getOrCreateDraft(type, type === "EVENT_TERMS" ? eventId : null, defaultTitle);
  return NextResponse.json({ ok: true, draft });
}
