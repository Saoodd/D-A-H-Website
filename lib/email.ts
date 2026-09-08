import "server-only";
import { Resend } from "resend";
import { formatAed } from "./constants";

// All outbound email is isolated behind the functions in this module, so the
// provider can be swapped (Resend -> SendGrid/Postmark/etc.) by editing this
// one file. Without RESEND_API_KEY set, emails are logged to the console
// instead of sent — handy for local dev/testing without a real API key.

const FROM = process.env.EMAIL_FROM || "Dar Al Hay <onboarding@resend.dev>";
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "";

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

async function send(to: string | string[], subject: string, html: string) {
  const client = getClient();
  if (!client) {
    console.log(`[email:dev-fallback] to=${JSON.stringify(to)} subject="${subject}"\n${html}\n`);
    return { ok: true, dev: true };
  }
  try {
    await client.emails.send({ from: FROM, to, subject, html });
    return { ok: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { ok: false };
  }
}

function wrap(bodyHtml: string) {
  return `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#EDE9E2;padding:32px;color:#3A2417;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;padding:32px;border:1px solid #E3D9CC;">
  <p style="letter-spacing:2px;font-size:12px;color:#6B4429;text-transform:uppercase;margin:0 0 24px;">Dar Al Hay &middot; Events</p>
  ${bodyHtml}
  <p style="margin-top:32px;font-size:12px;color:#9A8672;">Dar Al Hay (DAH) &mdash; Dubai</p>
  </div></body></html>`;
}

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export async function sendAccountCreatedEmails(opts: { vendorEmail: string; businessName: string }) {
  await send(
    opts.vendorEmail,
    `Welcome to Dar Al Hay — verification pending`,
    wrap(`<h2 style="margin-top:0;">Thanks, ${opts.businessName}!</h2>
      <p>We've received your DAH business account. Our team will review and verify your business shortly — you'll get another email once that's done.</p>
      <p>You can log into your <a href="${siteUrl()}/vendor/dashboard">vendor dashboard</a> at any time.</p>`)
  );
  if (ADMIN_NOTIFY_EMAIL) {
    await send(
      ADMIN_NOTIFY_EMAIL,
      `New business account — ${opts.businessName}`,
      wrap(`<p>New business account from <strong>${opts.businessName}</strong> (${opts.vendorEmail}) — awaiting verification.</p>
        <p><a href="${siteUrl()}/admin/vendors">Review in admin panel</a></p>`)
    );
  }
}

export async function sendVendorVerifiedEmail(opts: { vendorEmail: string; businessName: string }) {
  await send(
    opts.vendorEmail,
    `You're verified — welcome to Dar Al Hay`,
    wrap(`<h2 style="margin-top:0;">You're verified, ${opts.businessName}!</h2>
      <p>Your business account has been verified. You can now log into your <a href="${siteUrl()}/vendor/dashboard">dashboard</a> and apply to upcoming DAH events.</p>`)
  );
}

export async function sendAppliedToEventEmails(opts: {
  vendorEmail: string;
  businessName: string;
  eventName: string;
}) {
  await send(
    opts.vendorEmail,
    `We received your application — ${opts.eventName}`,
    wrap(`<h2 style="margin-top:0;">Thanks, ${opts.businessName}!</h2>
      <p>We've received your application for <strong>${opts.eventName}</strong>. Our team will review it and be in touch soon.</p>
      <p>You can log into your <a href="${siteUrl()}/vendor/dashboard">vendor dashboard</a> at any time to check its status.</p>`)
  );
  if (ADMIN_NOTIFY_EMAIL) {
    await send(
      ADMIN_NOTIFY_EMAIL,
      `New event application — ${opts.businessName} (${opts.eventName})`,
      wrap(`<p>New application from <strong>${opts.businessName}</strong> (${opts.vendorEmail}) for <strong>${opts.eventName}</strong>.</p>
        <p><a href="${siteUrl()}/admin/applications">Review in admin panel</a></p>`)
    );
  }
}

export async function sendApplicationApprovedEmail(opts: {
  vendorEmail: string;
  businessName: string;
  eventName: string;
  deadlineHours: number;
}) {
  await send(
    opts.vendorEmail,
    `You're accepted — ${opts.eventName}`,
    wrap(`<h2 style="margin-top:0;">Good news, ${opts.businessName}!</h2>
      <p>Your application for <strong>${opts.eventName}</strong> has been accepted.</p>
      <p>You have <strong>${opts.deadlineHours} hours</strong> to select a booth and complete payment to confirm your spot.</p>
      <p><a href="${siteUrl()}/vendor/dashboard" style="display:inline-block;background:#6B4429;color:#EDE9E2;padding:12px 20px;border-radius:8px;text-decoration:none;margin-top:12px;">Go to my dashboard</a></p>`)
  );
}

export async function sendAcceptanceExpiredEmail(opts: {
  vendorEmail: string;
  businessName: string;
  eventName: string;
}) {
  await send(
    opts.vendorEmail,
    `Your acceptance has expired — ${opts.eventName}`,
    wrap(`<h2 style="margin-top:0;">Hi ${opts.businessName},</h2>
      <p>Your acceptance window for <strong>${opts.eventName}</strong> has expired without payment, so your booth hold was released.</p>
      <p>If you'd still like to take part, reach out to us and we can re-accept your application.</p>`)
  );
}

export async function sendApplicationRejectedEmail(opts: {
  vendorEmail: string;
  businessName: string;
  eventName: string;
}) {
  await send(
    opts.vendorEmail,
    `Update on your application — ${opts.eventName}`,
    wrap(`<h2 style="margin-top:0;">Hi ${opts.businessName},</h2>
      <p>Thank you for applying to <strong>${opts.eventName}</strong>. Unfortunately we're not able to offer you a spot this time.</p>
      <p>We'd love to see an application from you for a future event — please keep an eye on our upcoming events.</p>`)
  );
}

export async function sendPaymentSuccessEmail(opts: {
  vendorEmail: string;
  businessName: string;
  eventName: string;
  boothCode: string;
  amountAedFils: number;
  paidAt: Date;
}) {
  await send(
    opts.vendorEmail,
    `Payment received — booth ${opts.boothCode} confirmed`,
    wrap(`<h2 style="margin-top:0;">You're confirmed, ${opts.businessName}!</h2>
      <p>Your payment for <strong>${opts.eventName}</strong> has been received.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:4px 0;color:#9A8672;">Event</td><td style="padding:4px 0;text-align:right;">${opts.eventName}</td></tr>
        <tr><td style="padding:4px 0;color:#9A8672;">Booth</td><td style="padding:4px 0;text-align:right;">${opts.boothCode}</td></tr>
        <tr><td style="padding:4px 0;color:#9A8672;">Amount paid</td><td style="padding:4px 0;text-align:right;">${formatAed(opts.amountAedFils)}</td></tr>
        <tr><td style="padding:4px 0;color:#9A8672;">Date</td><td style="padding:4px 0;text-align:right;">${opts.paidAt.toDateString()}</td></tr>
      </table>
      <p>Your event vendor WhatsApp group link is now live on your <a href="${siteUrl()}/vendor/dashboard">dashboard</a>.</p>`)
  );
  if (ADMIN_NOTIFY_EMAIL) {
    await send(
      ADMIN_NOTIFY_EMAIL,
      `Payment received — ${opts.businessName} / ${opts.eventName} / booth ${opts.boothCode}`,
      wrap(`<p><strong>${opts.businessName}</strong> paid ${formatAed(opts.amountAedFils)} for booth ${opts.boothCode} at ${opts.eventName}.</p>`)
    );
  }
}

export async function sendPaymentFailedEmail(opts: {
  vendorEmail: string;
  businessName: string;
  eventName: string;
  retryUrl: string;
}) {
  await send(
    opts.vendorEmail,
    `Payment failed — ${opts.eventName}`,
    wrap(`<h2 style="margin-top:0;">Hi ${opts.businessName},</h2>
      <p>Your payment for <strong>${opts.eventName}</strong> did not go through.</p>
      <p><a href="${opts.retryUrl}" style="display:inline-block;background:#6B4429;color:#EDE9E2;padding:12px 20px;border-radius:8px;text-decoration:none;">Try again</a></p>
      <p>If your acceptance deadline is close to expiring, please retry as soon as possible.</p>`)
  );
}

export async function sendCancellationRequestedAdminEmail(opts: {
  businessName: string;
  eventName: string;
  boothCode: string;
  reason: string;
}) {
  if (!ADMIN_NOTIFY_EMAIL) return;
  await send(
    ADMIN_NOTIFY_EMAIL,
    `Cancellation requested — ${opts.businessName} / ${opts.eventName}`,
    wrap(`<p><strong>${opts.businessName}</strong> requested to cancel booth ${opts.boothCode} at ${opts.eventName}.</p>
      <p><strong>Reason:</strong> ${opts.reason}</p>
      <p>This booking has been flagged in the admin panel for manual refund handling.</p>`)
  );
}

export async function sendContactMessageAdminEmail(opts: {
  name: string;
  email: string;
  message: string;
}) {
  if (!ADMIN_NOTIFY_EMAIL) return;
  await send(
    ADMIN_NOTIFY_EMAIL,
    `New contact message from ${opts.name}`,
    wrap(`<p><strong>${opts.name}</strong> (${opts.email}) wrote:</p><p>${opts.message}</p>`)
  );
}
