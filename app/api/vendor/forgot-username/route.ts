import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotUsernameSchema } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { sendUsernameReminderEmail } from "@/lib/email";

const GENERIC_MESSAGE = "If an account exists with that email, we've sent your username.";

// Same enumeration-safe shape as forgot-password: always the same
// response, rate limited by both IP and target email.
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`forgot-username:${ip}`, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const json = await req.json().catch(() => null);
  const parsed = forgotUsernameSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: GENERIC_MESSAGE });

  const email = parsed.data.email.toLowerCase();
  if (!rateLimit(`forgot-username-email:${email}`, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  const vendor = await prisma.vendor.findUnique({ where: { email } });
  if (vendor && vendor.accountStatus === "ACTIVE") {
    await sendUsernameReminderEmail({ vendorEmail: vendor.email, businessName: vendor.businessName, username: vendor.username });
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
