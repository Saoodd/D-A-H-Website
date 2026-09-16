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
  // Added for automatic use-case notifications (lib/notifications) —
  // BOOKING_UPDATED and VENDOR_SETUP_REMINDER need values none of the
  // above cover. Reusing the one shared variable vocabulary rather than
  // starting a second one, so the Template Registry's placeholder-mapping
  // UI (task: Admin UI Template Registry) works identically to Compose's.
  "booth_old",
  "booth_new",
  "setup_date",
  "setup_time",
] as const;
export type EmailVariable = (typeof EMAIL_VARIABLES)[number];

// Shared {{n}} -> value mapping shape for WhatsApp template placeholders
// AND buttons — used by both the Communications Center broadcast picker
// (lib/communications/render.ts) and the automatic use-case notification
// registry (lib/whatsapp/notificationRegistry.ts), so both admin surfaces
// map "this placeholder/button index" -> "this safe field, or this
// literal string" the exact same way.
export type WhatsAppVariableMapping = Record<string, { kind: "field"; field: EmailVariable } | { kind: "literal"; value: string }>;

// Human-readable labels for the placeholder-mapping dropdowns — shared by
// Compose (broadcast) and the Template Registry (automatic notifications)
// so a variable is never labeled two different ways in two admin screens.
export const VARIABLE_LABEL: Record<EmailVariable, string> = {
  business_name: "Business Name",
  contact_name: "Contact Name",
  event_name: "Event Name",
  event_date: "Event Date",
  venue: "Venue",
  booth: "Booth",
  amount_paid: "Amount Paid",
  amount_due: "Amount Due",
  acceptance_deadline: "Acceptance Deadline",
  booking_url: "Booking URL",
  booth_old: "Previous Booth",
  booth_new: "New Booth",
  setup_date: "Setup Date",
  setup_time: "Setup Time",
};
