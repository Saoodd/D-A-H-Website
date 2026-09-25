import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Uptime check for monitoring (e.g. an external pinger every few minutes).
// Reports only whether the app can reach its database; never any
// configuration, version or secret.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "up" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, database: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
