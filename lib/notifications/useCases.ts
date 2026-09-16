// The fixed set of DAH WhatsApp Utility notification use cases — the ONLY
// vocabulary lib/notifications/notify.ts and the Admin Template Registry
// (Admin > Communications > Template Registry) accept. Adding a new
// automatic notification means adding a name here, not inventing an
// ad-hoc string at a call site — keeps every "which use cases exist" and
// "which template does each one use" question answerable from one file
// plus one admin-editable table (WhatsAppNotificationTemplate).
export const NOTIFICATION_USE_CASES = [
  "APPLICATION_RECEIVED",
  "APPLICATION_ACCEPTED",
  "APPLICATION_REJECTED",
  "ACCEPTANCE_REMINDER",
  "ACCEPTANCE_EXPIRED",
  "BOOTH_SELECTION_REMINDER",
  "PAYMENT_REMINDER",
  "PAYMENT_RECEIVED",
  "BOOKING_CONFIRMED",
  "BOOKING_UPDATED",
  "EVENT_UPDATE",
  "EVENT_REMINDER",
  "VENDOR_SETUP_REMINDER",
  "EVENT_CANCELLED",
] as const;

export type NotificationUseCase = (typeof NOTIFICATION_USE_CASES)[number];

export const NOTIFICATION_USE_CASE_LABELS: Record<NotificationUseCase, string> = {
  APPLICATION_RECEIVED: "Application received",
  APPLICATION_ACCEPTED: "Application accepted",
  APPLICATION_REJECTED: "Application rejected",
  ACCEPTANCE_REMINDER: "Acceptance reminder",
  ACCEPTANCE_EXPIRED: "Acceptance expired",
  BOOTH_SELECTION_REMINDER: "Booth selection reminder",
  PAYMENT_REMINDER: "Payment reminder",
  PAYMENT_RECEIVED: "Payment received",
  BOOKING_CONFIRMED: "Booking confirmed",
  BOOKING_UPDATED: "Booking updated",
  EVENT_UPDATE: "Event update",
  EVENT_REMINDER: "Event reminder",
  VENDOR_SETUP_REMINDER: "Vendor setup reminder",
  EVENT_CANCELLED: "Event cancelled",
};

/** Which entity id a use case's dedupeKey/traceability is keyed on — must
 *  match what the trigger site actually has available and what makes a
 *  resend semantically "the same notification" (e.g. one PAYMENT_RECEIVED
 *  per Payment, not per Application, since an application could in theory
 *  have more than one payment attempt). */
export const USE_CASE_ENTITY_KIND: Record<NotificationUseCase, "application" | "payment" | "event" | "booth"> = {
  APPLICATION_RECEIVED: "application",
  APPLICATION_ACCEPTED: "application",
  APPLICATION_REJECTED: "application",
  ACCEPTANCE_REMINDER: "application",
  ACCEPTANCE_EXPIRED: "application",
  BOOTH_SELECTION_REMINDER: "application",
  PAYMENT_REMINDER: "application",
  PAYMENT_RECEIVED: "payment",
  BOOKING_CONFIRMED: "payment",
  BOOKING_UPDATED: "booth",
  EVENT_UPDATE: "event",
  EVENT_REMINDER: "event",
  VENDOR_SETUP_REMINDER: "application",
  EVENT_CANCELLED: "event",
};
