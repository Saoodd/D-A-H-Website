import "server-only";

// Single registry of every environment variable the app reads, with what
// breaks when it's missing. Used by instrumentation.ts to print one clear
// startup report instead of each integration failing obscurely at first use.
// Reports variable NAMES only — never values.

type EnvLevel = "required" | "production" | "optional";

interface EnvVar {
  /** One name, or several where any one of them is sufficient. */
  names: string[];
  level: EnvLevel;
  effect: string;
}

const ENV_VARS: EnvVar[] = [
  { names: ["DATABASE_URL"], level: "required", effect: "no database connection — every page fails" },
  { names: ["DIRECT_URL"], level: "required", effect: "prisma migrate deploy fails (Prisma does not fall back to DATABASE_URL)" },
  { names: ["AUTH_SECRET"], level: "required", effect: "no vendor/admin login, no WhatsApp OTP hashing" },
  { names: ["ADMIN_PASSWORD"], level: "required", effect: "admin login always rejected" },
  { names: ["NEXT_PUBLIC_SITE_URL"], level: "production", effect: "email links, sitemap, robots and social previews point at http://localhost:3000" },
  { names: ["RESEND_API_KEY"], level: "production", effect: "no emails are sent (password reset, notifications, receipts)" },
  { names: ["RESEND_EMAIL_DOMAIN", "EMAIL_FROM"], level: "production", effect: "emails send from Resend's shared onboarding@resend.dev sender" },
  { names: ["INFOBIP_WHATSAPP_BASE_URL"], level: "production", effect: "WhatsApp OTP and Communications Center cannot send" },
  { names: ["INFOBIP_WHATSAPP_API_KEY"], level: "production", effect: "WhatsApp OTP and Communications Center cannot send" },
  { names: ["INFOBIP_WHATSAPP_SENDER"], level: "production", effect: "WhatsApp OTP and Communications Center cannot send" },
  { names: ["INFOBIP_WHATSAPP_AUTH_TEMPLATE"], level: "production", effect: "phone verification cannot send an OTP (vendors cannot apply to events)" },
  { names: ["INFOBIP_WHATSAPP_AUTH_TEMPLATE_LANGUAGE"], level: "production", effect: "phone verification cannot send an OTP (vendors cannot apply to events)" },
  { names: ["PUBLIC_BLOB_READ_WRITE_TOKEN", "PUBLIC_BLOB_STORE_ID"], level: "production", effect: "gallery, event cover, floor plan and logo uploads fail" },
  { names: ["CRON_SECRET"], level: "production", effect: "hourly reminder cron refuses every call — no reminder messages" },
  { names: ["INFOBIP_WEBHOOK_SECRET"], level: "production", effect: "WhatsApp delivery reports rejected — delivery status stays at SENT" },
  { names: ["RESEND_WEBHOOK_SECRET"], level: "production", effect: "email delivery-status webhook ignored" },
  { names: ["ADMIN_NOTIFY_EMAIL"], level: "optional", effect: "admin is not emailed about new applications/messages" },
  { names: ["AGREEMENTS_SHEETS_WEBHOOK_URL"], level: "optional", effect: "agreement acceptances are not mirrored to Google Sheets" },
  { names: ["PAYMENT_PROVIDER"], level: "optional", effect: "defaults to the sandbox payment gateway" },
  { names: ["GOOGLE_CLIENT_ID"], level: "optional", effect: "\"Continue with Google\" sign-in is hidden (needs GOOGLE_CLIENT_SECRET too)" },
  {
    names: ["ALLOW_SANDBOX_PAYMENTS"],
    level: "optional",
    effect: "online checkout stays off in production while the sandbox gateway is configured (admins record payments instead)",
  },
];
// BLOB_READ_WRITE_TOKEN (private store) is deliberately absent: on Vercel,
// @vercel/blob resolves the default store via the ambient OIDC token, so an
// unset token there is normal, not a misconfiguration.

export interface MissingEnv {
  name: string;
  level: EnvLevel;
  effect: string;
}

export function findMissingEnv(env: NodeJS.ProcessEnv = process.env): MissingEnv[] {
  return ENV_VARS.filter((v) => !v.names.some((n) => env[n]?.trim())).map((v) => ({
    name: v.names.join(" or "),
    level: v.level,
    effect: v.effect,
  }));
}

export function reportEnv(): void {
  const missing = findMissingEnv();
  if (missing.length === 0) return;
  const isProd = process.env.NODE_ENV === "production";

  const required = missing.filter((m) => m.level === "required");
  const production = missing.filter((m) => m.level === "production");
  const optional = missing.filter((m) => m.level === "optional");

  const line = (m: MissingEnv) => `  - ${m.name}: ${m.effect}`;
  if (required.length) {
    console.error(`[env] Missing REQUIRED environment variables:\n${required.map(line).join("\n")}`);
  }
  // Production-only integrations are expected to be absent in local dev —
  // list them there as information, escalate to errors only in production.
  if (production.length) {
    const log = isProd ? console.error : console.info;
    log(`[env] ${isProd ? "Missing production" : "Not configured locally (features disabled)"}:\n${production.map(line).join("\n")}`);
  }
  if (optional.length && !isProd) {
    console.info(`[env] Optional, not set:\n${optional.map(line).join("\n")}`);
  }
}
