import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { vendorLoginSchema } from "@/lib/validation";
import { verifyPassword, createVendorSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`vendor-login:${ip}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = vendorLoginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter your email and password." }, { status: 400 });
  }

  const vendor = await prisma.vendor.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!vendor || !(await verifyPassword(parsed.data.password, vendor.passwordHash))) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  await createVendorSession(vendor.id);
  return NextResponse.json({ ok: true });
}
