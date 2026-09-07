import { NextResponse } from "next/server";
import { destroyVendorSession } from "@/lib/auth";

export async function POST() {
  await destroyVendorSession();
  return NextResponse.json({ ok: true });
}
