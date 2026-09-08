import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { publishDraft } from "@/lib/agreements";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const agreement = await publishDraft(id);
    return NextResponse.json({ ok: true, agreement });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not publish." }, { status: 400 });
  }
}
