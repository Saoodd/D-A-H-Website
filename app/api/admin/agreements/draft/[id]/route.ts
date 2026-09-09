import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { saveDraft, discardDraft } from "@/lib/agreements";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim();
  const bodyHtml = String(body.bodyHtml || "");

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

  try {
    const draft = await saveDraft(id, { title, bodyHtml });
    return NextResponse.json({ ok: true, draft });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save draft." }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await discardDraft(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not discard draft." }, { status: 400 });
  }
}
