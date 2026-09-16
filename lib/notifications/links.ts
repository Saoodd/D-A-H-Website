// Deep-link builders shared by every automatic WhatsApp notification
// trigger site — mirrors lib/communications/render.ts's own siteUrl()/
// booking_url logic exactly, so a vendor gets the same link shape whether
// it came from a broadcast or an automatic notification.
function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function applicationUrl(applicationId: string): string {
  return `${siteUrl()}/vendor/applications/${applicationId}`;
}

export function dashboardUrl(): string {
  return `${siteUrl()}/vendor/dashboard`;
}

export function receiptUrl(paymentId: string): string {
  return `${siteUrl()}/vendor/receipts/${paymentId}`;
}
