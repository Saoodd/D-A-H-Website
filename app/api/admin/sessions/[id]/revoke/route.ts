import { NextResponse } from "next/server";
import { getAdminSessionId, destroyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Signs out one admin session (Settings → Active admin sessions). Revoking
// the current session is the same as logging out.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getAdminSessionId();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (id === current) {
    await destroyAdminSession();
    return NextResponse.json({ ok: true, signedOut: true });
  }
  const res = await prisma.adminSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count === 0) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
