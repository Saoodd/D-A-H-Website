// Predefined, safe personalization variable names — deliberately NOT
// "server-only" (unlike render.ts, which does the actual sanitize/
// substitute/render work) so the Compose UI (a client component) can show
// the Insert Variable menu without pulling server-only rendering code
// (DOMPurify/email template helpers) into the browser bundle.
export const EMAIL_VARIABLES = [
  "business_name",
  "contact_name",
  "event_name",
  "event_date",
  "venue",
  "booth",
  "amount_paid",
  "amount_due",
  "acceptance_deadline",
  "booking_url",
] as const;
export type EmailVariable = (typeof EMAIL_VARIABLES)[number];
