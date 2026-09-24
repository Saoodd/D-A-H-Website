import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { adminLoginSchema } from "@/lib/validation";
import { createAdminSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";

function safeCompare(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!(await rateLimit(`admin-login:${ip}`, 8, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = adminLoginSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Password required" }, { status: 400 });

  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || !safeCompare(parsed.data.password, expected)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
