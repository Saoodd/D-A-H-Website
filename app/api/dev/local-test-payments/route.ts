import { NextRequest, NextResponse } from "next/server";
import { getGateway } from "@/payments/gateway";

// DEVELOPMENT ONLY: lets automated tests set what the local-test payment
// stand-in reports for a charge (to exercise reconciliation). 404 in
// production and whenever the local-test provider isn't active.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" || getGateway().name !== "local-test") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { setLocalTestProviderState } = await import("@/payments/localTestGateway");
  const body = await req.json();
  setLocalTestProviderState(String(body.providerRef), {
    state: body.state,
    amountAedFils: Number(body.amountAedFils),
    currency: String(body.currency ?? "AED"),
  });
  return NextResponse.json({ ok: true });
}
