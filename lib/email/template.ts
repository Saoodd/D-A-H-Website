import "server-only";
import { DAH_CHARCOAL, DAH_OLIVE, DAH_MUTED_TEXT, DAH_BORDER, DAH_IVORY } from "@/lib/theme/brand";

// One shared DAH transactional email design system — table-based markup and
// inline styles throughout, since that's what actually renders consistently
// across Gmail/Outlook/Apple Mail, not a real CSS stylesheet. Every
// transactional email is built from these three pieces so they all feel
// like the same product: restrained ivory/charcoal palette, one accent
// color, generous spacing, no gradients/emoji/banners.

const INK = DAH_CHARCOAL; // near-black body text
const BROWN = DAH_OLIVE; // brand accent
const BROWN_LIGHT = DAH_MUTED_TEXT; // muted secondary text
const BORDER = DAH_BORDER;
const IVORY = DAH_IVORY;

/** Wraps a block of already-built inner HTML in the shared DAH email shell:
 *  wordmark header, white card, footer. `preheader` is the short hidden
 *  summary line most clients show next to the subject in the inbox list. */
export function emailShell(innerHtml: string, opts?: { preheader?: string }): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dar Al Hay</title>
  </head>
  <body style="margin:0;padding:0;background-color:${IVORY};font-family:Helvetica,Arial,sans-serif;">
    ${opts?.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${IVORY};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 8px 28px;">
                <span style="font-size:13px;letter-spacing:3px;color:${BROWN};text-transform:uppercase;font-weight:600;">Dar Al Hay</span>
              </td>
            </tr>
            <tr>
              <td style="background-color:#FFFFFF;border:1px solid ${BORDER};border-radius:14px;padding:40px 36px;">
                ${innerHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 8px 0;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${BROWN_LIGHT};">
                  Dar Al Hay (DAH) &middot; Dubai, United Arab Emirates
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:${INK};font-weight:500;">${text}</h1>`;
}

export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${INK};">${html}</p>`;
}

export function emailMuted(html: string): string {
  return `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${BROWN_LIGHT};">${html}</p>`;
}

/** A single, simple CTA button — the only button style used in any DAH
 *  email, so every transactional message reads as the same product. */
export function emailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;">
    <tr>
      <td style="border-radius:999px;background-color:${BROWN};">
        <a href="${href}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:${IVORY};text-decoration:none;letter-spacing:0.3px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

/** A quiet key/value details table — event name, amount, dates, etc. */
export function emailFactTable(rows: [label: string, value: string][]): string {
  const body = rows
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid ${BORDER};font-size:13px;color:${BROWN_LIGHT};">${label}</td>
          <td style="padding:8px 0;border-bottom:1px solid ${BORDER};font-size:13px;color:${INK};text-align:right;font-weight:500;">${value}</td>
        </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">${body}</table>`;
}

export function emailDivider(): string {
  return `<hr style="border:none;border-top:1px solid ${BORDER};margin:24px 0;" />`;
}
