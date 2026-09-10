import "server-only";
import { Resend } from "resend";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

// Every outbound email in the app goes through sendEmail() below — no
// component or route ever talks to Resend directly (PART 41: provider
// abstraction). Swapping providers, or changing how delivery is logged,
// only ever touches this one file.

// The verified sending domain (dahevents.com) is a Vercel/Resend project
// setting, not a value that belongs in application code — RESEND_EMAIL_DOMAIN
// is the domain part only ("dahevents.com"), never the full address.
// EMAIL_FROM stays supported as a fallback for local/dev environments that
// haven't set RESEND_EMAIL_DOMAIN (e.g. Resend's own onboarding@resend.dev
// sender, which works without a verified custom domain).
const FROM = process.env.RESEND_EMAIL_DOMAIN
  ? `Dar Al Hay Events <no-reply@${process.env.RESEND_EMAIL_DOMAIN}>`
  : process.env.EMAIL_FROM || "Dar Al Hay Events <onboarding@resend.dev>";

export const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "";

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  /** Delivery-log category — see EmailDelivery.type in schema.prisma. */
  type: string;
  vendorId?: string;
  eventId?: string;
  /** When set, a stable key identifying the underlying business event (e.g.
   *  "application_accepted:<applicationId>:<acceptedAtIso>"). A second call
   *  with the same key is recognized as a retried request for the SAME
   *  event — via EmailDelivery.dedupeKey's unique constraint — and is
   *  skipped rather than sending a duplicate notification. Omit for
   *  naturally resendable emails (verification, password reset) where a
   *  fresh send is always intentional. */
  dedupeKey?: string;
}

async function logQueued(opts: SendEmailOptions, toEmail: string): Promise<string | null> {
  if (!opts.dedupeKey) return null;
  try {
    const row = await prisma.emailDelivery.create({
      data: { type: opts.type, vendorId: opts.vendorId, eventId: opts.eventId, toEmail, status: "QUEUED", dedupeKey: opts.dedupeKey },
    });
    return row.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return "DUPLICATE";
    }
    throw err;
  }
}

async function logOutcome(
  rowId: string | null,
  opts: SendEmailOptions,
  toEmail: string,
  outcome: { status: "SENT" | "FAILED"; providerMessageId?: string; failReason?: string }
) {
  const data = {
    status: outcome.status,
    ...(outcome.status === "SENT" ? { sentAt: new Date() } : {}),
    ...(outcome.providerMessageId ? { providerMessageId: outcome.providerMessageId } : {}),
    ...(outcome.failReason ? { failReason: outcome.failReason.slice(0, 500) } : {}),
  };
  if (rowId) {
    await prisma.emailDelivery.update({ where: { id: rowId }, data }).catch(() => {});
  } else {
    await prisma.emailDelivery
      .create({ data: { type: opts.type, vendorId: opts.vendorId, eventId: opts.eventId, toEmail, ...data } })
      .catch(() => {});
  }
}

/** Sends one email and records it in the delivery log. Never throws — a
 *  Resend outage or a bad address always resolves to { ok: false }, logged
 *  as FAILED, so a communication failure can never corrupt or roll back the
 *  business action that triggered it (PART 40). */
export async function sendEmail(opts: SendEmailOptions): Promise<{ ok: boolean; skipped?: boolean }> {
  const toEmail = Array.isArray(opts.to) ? opts.to[0] : opts.to;

  const rowId = await logQueued(opts, toEmail);
  if (rowId === "DUPLICATE") return { ok: true, skipped: true };

  const client = getClient();
  if (!client) {
    console.log(`[email:dev-fallback] to=${JSON.stringify(opts.to)} subject="${opts.subject}"\n${opts.html}\n`);
    await logOutcome(rowId, opts, toEmail, { status: "SENT" });
    return { ok: true };
  }

  try {
    const result = await client.emails.send({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html });
    if (result.error) {
      console.error("[email] send failed", result.error);
      await logOutcome(rowId, opts, toEmail, { status: "FAILED", failReason: result.error.message });
      return { ok: false };
    }
    await logOutcome(rowId, opts, toEmail, { status: "SENT", providerMessageId: result.data?.id });
    return { ok: true };
  } catch (err) {
    console.error("[email] send failed", err);
    await logOutcome(rowId, opts, toEmail, { status: "FAILED", failReason: err instanceof Error ? err.message : "Unknown error" });
    return { ok: false };
  }
}
