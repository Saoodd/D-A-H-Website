import { NextRequest, NextResponse } from "next/server";
import { getVendorSession } from "@/lib/auth";
import { getApplicationView } from "@/lib/applicationView";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const view = await getApplicationView(id, session.vendorId);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(view);
}
