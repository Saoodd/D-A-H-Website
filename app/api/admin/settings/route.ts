import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminGuard";
import { getSettings } from "@/lib/settings";

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await getSettings(); // ensure the singleton row exists
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if ("mainCommunityWhatsappLink" in body) data.mainCommunityWhatsappLink = body.mainCommunityWhatsappLink || null;
  if (body.defaultAcceptanceDeadlineHours) {
    const hours = Number(body.defaultAcceptanceDeadlineHours);
    if (hours > 0) data.defaultAcceptanceDeadlineHours = hours;
  }

  const settings = await prisma.settings.update({ where: { id: "singleton" }, data });
  return NextResponse.json({ ok: true, settings });
}
