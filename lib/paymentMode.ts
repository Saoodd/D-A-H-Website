import "server-only";
import { getGateway } from "@/payments/gateway";

// Whether vendors can pay online right now.
//
//   LIVE     — a real payment provider is configured (none exists yet; see
//              payments/gateway.ts for the integration point).
//   SANDBOX  — the fake gateway, allowed: any non-production build, or
//              production with ALLOW_SANDBOX_PAYMENTS=true set deliberately.
//   DISABLED — production running the fake gateway. Online checkout is
//              refused; DAH records payments manually from the admin
//              application page (bank transfer, cash, card terminal) via
//              POST /api/admin/applications/[id]/offline-payment.
//
// Why DISABLED exists: the sandbox gateway confirms whatever outcome the
// browser reports, so in production it would sell booths and issue real
// receipt numbers with no money collected (SECURITY_AUDIT.md, C1).
//
// Note that Vercel Preview deployments also run with NODE_ENV=production,
// so they are DISABLED too unless ALLOW_SANDBOX_PAYMENTS is set for the
// Preview environment only.
export type OnlinePaymentMode = "LIVE" | "SANDBOX" | "DISABLED";

export function onlinePaymentMode(): OnlinePaymentMode {
  if (getGateway().name !== "sandbox") return "LIVE";
  if (process.env.NODE_ENV !== "production") return "SANDBOX";
  return process.env.ALLOW_SANDBOX_PAYMENTS === "true" ? "SANDBOX" : "DISABLED";
}

export const ONLINE_PAYMENT_UNAVAILABLE = "ONLINE_PAYMENT_UNAVAILABLE";
