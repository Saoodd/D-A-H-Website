import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contactSchema } from "@/lib/validation";
import { sendContactMessageAdminEmail } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`contact:${ip}`, 8, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  if (!json) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = contactSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const data = parsed.data;

  if (data.website && data.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  await prisma.contactMessage.create({
    data: { name: data.name, email: data.email, message: data.message },
  });

  await sendContactMessageAdminEmail(data);

  return NextResponse.json({ ok: true });
}
