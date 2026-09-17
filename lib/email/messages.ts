import "server-only";
import { formatAed } from "../constants";
import { trustedSiteUrl } from "../url";
import { sendEmail, ADMIN_NOTIFY_EMAIL } from "./core";
import { emailShell, emailHeading, emailParagraph, emailMuted, emailButton, emailFactTable, emailDivider } from "./template";
import { DAH_OLIVE, DAH_CHARCOAL } from "../theme/brand";

// Every function here builds one specific DAH transactional email and hands
// it to sendEmail() (lib/email/core.ts) for actual delivery + logging.
// Nothing outside this file constructs email HTML directly.

const site = trustedSiteUrl;

// --- Signup / business verification -----------------------------------------

export async function sendAccountCreatedEmails(opts: { vendorId: string; vendorEmail: string; businessName: string }) {
  await sendEmail({
    to: opts.vendorEmail,
    type: "ACCOUNT_CREATED",
    vendorId: opts.vendorId,
    subject: "Welcome to Dar Al Hay",
    html: emailShell(
      `${emailHeading(`Welcome, ${opts.businessName}`)}
      ${emailParagraph("Your Dar Al Hay business account has been created. We've sent a separate email with a link to confirm your email address.")}
      ${emailParagraph("Once your business is verified by our team, you'll be able to apply to upcoming DAH events from your dashboard — you'll just need to verify your mobile number first, which only takes a moment from your Profile.")}
      ${emailButton("Go to my profile", `${site()}/vendor/profile`)}`,
      { preheader: "Confirm your email and set up your DAH account." }
    ),
  });
  if (ADMIN_NOTIFY_EMAIL) {
    await sendEmail({
      to: ADMIN_NOTIFY_EMAIL,
      type: "ADMIN_NEW_ACCOUNT",
      subject: `New business account — ${opts.businessName}`,
      html: emailShell(
        `${emailParagraph(`New business account from <strong>${opts.businessName}</strong> (${opts.vendorEmail}) — awaiting verification.`)}
        ${emailButton("Review in admin panel", `${site()}/admin/vendors`)}`
      ),
    });
  }
}

// --- Email verification -------------------------------------------------------

export async function sendVerifyEmailEmail(opts: { vendorId: string; vendorEmail: string; businessName: string; verifyUrl: string }) {
  await sendEmail({
    to: opts.vendorEmail,
    type: "EMAIL_VERIFY",
    vendorId: opts.vendorId,
    subject: "Verify your email",
    html: emailShell(
      `${emailHeading("Verify your email")}
      ${emailParagraph(`Welcome to Dar Al Hay. You can confirm your email address for your business account, ${opts.businessName}, as an added security measure — it isn't required to use your account.`)}
      ${emailButton("Verify email", opts.verifyUrl)}
      ${emailMuted("This link expires in 24 hours. If you didn't create a Dar Al Hay account, you can ignore this email.")}`,
      { preheader: "Optionally confirm your email address for your DAH account." }
    ),
  });
}

export async function sendVendorVerifiedEmail(opts: { vendorId: string; vendorEmail: string; businessName: string }) {
  await sendEmail({
    to: opts.vendorEmail,
    type: "VENDOR_VERIFIED",
    vendorId: opts.vendorId,
    subject: "You're verified — welcome to Dar Al Hay",
    html: emailShell(
      `${emailHeading(`You're verified, ${opts.businessName}`)}
      ${emailParagraph("Your business account has been verified. You can now apply to upcoming DAH events from your dashboard.")}
      ${emailButton("Go to my dashboard", `${site()}/vendor/dashboard`)}`
    ),
  });
}

// --- Applications --------------------------------------------------------------

export async function sendAppliedToEventEmails(opts: { vendorId: string; vendorEmail: string; businessName: string; eventId: string; eventName: string }) {
  await sendEmail({
    to: opts.vendorEmail,
    type: "APPLICATION_SUBMITTED",
    vendorId: opts.vendorId,
    eventId: opts.eventId,
    subject: `Application received — ${opts.eventName}`,
    html: emailShell(
      `${emailHeading("Your application has been received")}
      ${emailParagraph(`<strong>${opts.eventName}</strong><br/>Application submitted.`)}
      ${emailParagraph("We'll notify you as soon as your application has been reviewed.")}
      ${emailButton("View my dashboard", `${site()}/vendor/dashboard`)}`
    ),
  });
  if (ADMIN_NOTIFY_EMAIL) {
    await sendEmail({
      to: ADMIN_NOTIFY_EMAIL,
      type: "ADMIN_NEW_APPLICATION",
      eventId: opts.eventId,
      subject: `New event application — ${opts.businessName} (${opts.eventName})`,
      html: emailShell(
        `${emailParagraph(`New application from <strong>${opts.businessName}</strong> (${opts.vendorEmail}) for <strong>${opts.eventName}</strong>.`)}
        ${emailButton("Review in admin panel", `${site()}/admin/applications`)}`
      ),
    });
  }
}

export async function sendApplicationApprovedEmail(opts: {
  vendorId: string;
  vendorEmail: string;
  businessName: string;
  eventId: string;
  eventName: string;
  eventStartDate: Date;
  eventLocation: string;
  deadlineHours: number;
  acceptanceExpiresAt: Date;
  dedupeKey?: string;
}) {
  const dateFmt = opts.eventStartDate.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" });
  const deadlineFmt = opts.acceptanceExpiresAt.toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" });
  await sendEmail({
    to: opts.vendorEmail,
    type: "APPLICATION_ACCEPTED",
    vendorId: opts.vendorId,
    eventId: opts.eventId,
    dedupeKey: opts.dedupeKey,
    subject: `You're accepted — ${opts.eventName}`,
    html: emailShell(
      `${emailHeading(`You've been accepted to ${opts.eventName}`)}
      ${emailParagraph(`Good news, ${opts.businessName} — your application has been accepted.`)}
      ${emailFactTable([
        ["Event", opts.eventName],
        ["Date", dateFmt],
        ["Venue", opts.eventLocation],
        ["Complete booking before", deadlineFmt],
      ])}
      ${emailParagraph(`Please select a booth and complete payment within <strong>${opts.deadlineHours} hours</strong> to confirm your spot.`)}
      ${emailButton("Continue booking", `${site()}/vendor/dashboard`)}`,
      { preheader: `Complete your booking before ${deadlineFmt}.` }
    ),
  });
}

export async function sendAcceptanceExpiredEmail(opts: { vendorId: string; vendorEmail: string; businessName: string; eventId: string; eventName: string; dedupeKey?: string }) {
  await sendEmail({
    to: opts.vendorEmail,
    type: "APPLICATION_EXPIRED",
    vendorId: opts.vendorId,
    eventId: opts.eventId,
    dedupeKey: opts.dedupeKey,
    subject: `Your acceptance has expired — ${opts.eventName}`,
    html: emailShell(
      `${emailHeading("Your acceptance window has closed")}
      ${emailParagraph(`Hi ${opts.businessName}, your acceptance window for <strong>${opts.eventName}</strong> expired without payment, so your booth hold was released.`)}
      ${emailParagraph("If you'd still like to take part, please reach out and we can reopen your application.")}`
    ),
  });
}

export async function sendApplicationRejectedEmail(opts: { vendorId: string; vendorEmail: string; businessName: string; eventId: string; eventName: string; dedupeKey?: string }) {
  await sendEmail({
    to: opts.vendorEmail,
    type: "APPLICATION_REJECTED",
    vendorId: opts.vendorId,
    eventId: opts.eventId,
    dedupeKey: opts.dedupeKey,
    subject: `Update on your application — ${opts.eventName}`,
    html: emailShell(
      `${emailHeading("An update on your application")}
      ${emailParagraph(`Hi ${opts.businessName}, thank you for applying to <strong>${opts.eventName}</strong>. We're not able to offer you a spot this time.`)}
      ${emailParagraph("We'd love to see an application from you for a future DAH event.")}`
    ),
  });
}

// --- Payment / booking -----------------------------------------------------------

export async function sendPaymentSuccessEmail(opts: {
  vendorId: string;
  vendorEmail: string;
  businessName: string;
  eventId: string;
  eventName: string;
  eventStartDate: Date;
  eventLocation: string;
  boothCode: string;
  boothSizeLabel: string;
  subtotalAedFils: number;
  vatAedFils: number;
  vatApplicable: boolean;
  totalAedFils: number;
  receiptNumber: string | null;
  paidAt: Date;
  receiptUrl: string;
  viewBookingUrl: string;
  dedupeKey?: string;
}) {
  const dateFmt = opts.eventStartDate.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" });
  const rows: [string, string][] = [
    ["Event", opts.eventName],
    ["Date", dateFmt],
    ["Venue", opts.eventLocation],
    ["Business", opts.businessName],
    ["Booth", `${opts.boothCode} (${opts.boothSizeLabel})`],
  ];
  if (opts.vatApplicable) {
    rows.push(["Booth price", formatAed(opts.subtotalAedFils)]);
    rows.push(["VAT (5%)", formatAed(opts.vatAedFils)]);
  }
  rows.push(["Total paid", formatAed(opts.totalAedFils)]);
  if (opts.receiptNumber) rows.push(["Receipt no.", opts.receiptNumber]);

  await sendEmail({
    to: opts.vendorEmail,
    type: "PAYMENT_RECEIPT",
    vendorId: opts.vendorId,
    eventId: opts.eventId,
    dedupeKey: opts.dedupeKey,
    subject: `Booking confirmed — booth ${opts.boothCode}, ${opts.eventName}`,
    html: emailShell(
      `${emailHeading(`You're confirmed, ${opts.businessName}`)}
      ${emailParagraph(`Your payment for <strong>${opts.eventName}</strong> has been received and your booth is confirmed.`)}
      ${emailFactTable(rows)}
      ${emailButton("View my booking", opts.viewBookingUrl)}
      ${emailMuted(`<a href="${opts.receiptUrl}" style="color:${DAH_OLIVE};">View / download your payment receipt</a>`)}
      ${emailMuted("Your event vendor WhatsApp group link, if available, is on your dashboard.")}`,
      { preheader: `Booth ${opts.boothCode} confirmed for ${opts.eventName}.` }
    ),
  });
  if (ADMIN_NOTIFY_EMAIL) {
    await sendEmail({
      to: ADMIN_NOTIFY_EMAIL,
      type: "ADMIN_PAYMENT_RECEIVED",
      eventId: opts.eventId,
      subject: `Payment received — ${opts.businessName} / ${opts.eventName} / booth ${opts.boothCode}`,
      html: emailShell(emailParagraph(`<strong>${opts.businessName}</strong> paid ${formatAed(opts.totalAedFils)} for booth ${opts.boothCode} at ${opts.eventName}.`)),
    });
  }
}

export async function sendPaymentFailedEmail(opts: { vendorId: string; vendorEmail: string; businessName: string; eventName: string; retryUrl: string }) {
  await sendEmail({
    to: opts.vendorEmail,
    type: "PAYMENT_FAILED",
    vendorId: opts.vendorId,
    subject: `Payment failed — ${opts.eventName}`,
    html: emailShell(
      `${emailHeading("Your payment didn't go through")}
      ${emailParagraph(`Hi ${opts.businessName}, your payment for <strong>${opts.eventName}</strong> was not successful.`)}
      ${emailButton("Try again", opts.retryUrl)}
      ${emailMuted("If your acceptance deadline is close to expiring, please retry as soon as possible.")}`
    ),
  });
}

// --- Admin-facing (unchanged triggers) -----------------------------------------

export async function sendCancellationRequestedAdminEmail(opts: { businessName: string; eventName: string; boothCode: string; reason: string }) {
  if (!ADMIN_NOTIFY_EMAIL) return;
  await sendEmail({
    to: ADMIN_NOTIFY_EMAIL,
    type: "ADMIN_CANCELLATION_REQUESTED",
    subject: `Cancellation requested — ${opts.businessName} / ${opts.eventName}`,
    html: emailShell(
      `${emailParagraph(`<strong>${opts.businessName}</strong> requested to cancel booth ${opts.boothCode} at ${opts.eventName}.`)}
      ${emailParagraph(`<strong>Reason:</strong> ${opts.reason}`)}
      ${emailMuted("This booking has been flagged in the admin panel for manual refund handling.")}`
    ),
  });
}

export async function sendContactMessageAdminEmail(opts: { name: string; email: string; message: string }) {
  if (!ADMIN_NOTIFY_EMAIL) return;
  await sendEmail({
    to: ADMIN_NOTIFY_EMAIL,
    type: "ADMIN_CONTACT_MESSAGE",
    subject: `New contact message from ${opts.name}`,
    html: emailShell(emailParagraph(`<strong>${opts.name}</strong> (${opts.email}) wrote:`) + emailParagraph(opts.message)),
  });
}

// --- Account security ---------------------------------------------------------

export async function sendPasswordResetEmail(opts: { vendorId: string; vendorEmail: string; businessName: string; resetUrl: string }) {
  await sendEmail({
    to: opts.vendorEmail,
    type: "PASSWORD_RESET",
    vendorId: opts.vendorId,
    subject: "Reset your Dar Al Hay password",
    html: emailShell(
      `${emailHeading("Reset your password")}
      ${emailParagraph(`Hi ${opts.businessName}, we received a request to reset your DAH account password. This link expires in 1 hour and can only be used once.`)}
      ${emailButton("Choose a new password", opts.resetUrl)}
      ${emailMuted("If you didn't request this, no action is required — your password won't change.")}`
    ),
  });
}

export async function sendUsernameReminderEmail(opts: { vendorId: string; vendorEmail: string; businessName: string; username: string }) {
  await sendEmail({
    to: opts.vendorEmail,
    type: "USERNAME_REMINDER",
    vendorId: opts.vendorId,
    subject: "Your Dar Al Hay username",
    html: emailShell(
      `${emailHeading(`Hi ${opts.businessName}`)}
      ${emailParagraph("You (or someone with access to this inbox) asked us for a reminder of your DAH username.")}
      <p style="margin:8px 0 20px;font-size:20px;font-weight:600;color:${DAH_CHARCOAL};">${opts.username}</p>
      ${emailButton("Log in", `${site()}/vendor/login`)}`
    ),
  });
}

export async function sendEmailChangeVerifyEmail(opts: { vendorId: string; newEmail: string; businessName: string; verifyUrl: string }) {
  await sendEmail({
    to: opts.newEmail,
    type: "EMAIL_CHANGE_VERIFY",
    vendorId: opts.vendorId,
    subject: "Confirm your new Dar Al Hay email address",
    html: emailShell(
      `${emailHeading("Confirm this email address")}
      ${emailParagraph(`Hi ${opts.businessName}, please confirm that <strong>${opts.newEmail}</strong> is your new DAH account email. This link expires in 1 hour.`)}
      ${emailButton("Confirm new email", opts.verifyUrl)}
      ${emailMuted("Your login email won't change until you confirm this link. If you didn't request this, you can ignore it.")}`
    ),
  });
}

export async function sendEmailChangedNotice(opts: { vendorId: string; oldEmail: string; businessName: string; newEmail: string }) {
  await sendEmail({
    to: opts.oldEmail,
    type: "EMAIL_CHANGED_NOTICE",
    vendorId: opts.vendorId,
    subject: "Your Dar Al Hay account email was changed",
    html: emailShell(
      `${emailHeading("Security notice")}
      ${emailParagraph(`Hi ${opts.businessName}, your DAH account login email was just changed to <strong>${opts.newEmail}</strong>.`)}
      ${emailParagraph("If you made this change, no action is needed. If you didn't, please contact us immediately.")}`
    ),
  });
}

export async function sendAccountClosedEmail(opts: { vendorId: string; vendorEmail: string; businessName: string }) {
  await sendEmail({
    to: opts.vendorEmail,
    type: "ACCOUNT_CLOSED",
    vendorId: opts.vendorId,
    subject: "Your Dar Al Hay account has been closed",
    html: emailShell(
      `${emailHeading(`Hi ${opts.businessName}`)}
      ${emailParagraph("As requested, your DAH business account has been closed. You'll no longer be able to log in.")}
      ${emailParagraph("Records DAH is required to retain — signed agreements, payments and booking history — remain on file as required by law; your personal profile details have been removed.")}
      ${emailMuted("If this wasn't you, please contact us immediately.")}`
    ),
  });
}

// --- Warnings ------------------------------------------------------------------

const SEVERITY_LABEL: Record<string, string> = { NOTICE: "Notice", WARNING: "Warning", FINAL_WARNING: "Final Warning" };

export async function sendWarningEmail(opts: {
  vendorId: string;
  vendorEmail: string;
  businessName: string;
  title: string;
  description: string;
  severity: string;
  eventName: string | null;
  dedupeKey?: string;
}) {
  const label = SEVERITY_LABEL[opts.severity] || "Notice";
  await sendEmail({
    to: opts.vendorEmail,
    type: "WARNING",
    vendorId: opts.vendorId,
    dedupeKey: opts.dedupeKey,
    subject: `${label}: ${opts.title}`,
    html: emailShell(
      `${emailHeading(label)}
      ${emailParagraph(`Hi ${opts.businessName}, DAH has issued the following ${label.toLowerCase()} on your account${opts.eventName ? ` regarding <strong>${opts.eventName}</strong>` : ""}.`)}
      ${emailDivider()}
      ${emailParagraph(`<strong>${opts.title}</strong>`)}
      ${emailParagraph(opts.description)}
      ${emailDivider()}
      ${emailButton("View in my profile", `${site()}/vendor/profile`)}`
    ),
  });
}
