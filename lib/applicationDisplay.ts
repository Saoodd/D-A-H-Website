import type { DisplayStatus } from "./constants";

// Admin-facing labels/tones for DisplayStatus — shared between the
// event-first Applications list and each event's application table so the
// two screens can never drift on what a status is called or colored.
export const APPLICATION_DISPLAY_LABEL: Record<DisplayStatus, string> = {
  PENDING: "Pending",
  ACCEPTED_UNPAID: "Accepted — Awaiting Action",
  PAID: "Confirmed / Paid",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

export const APPLICATION_DISPLAY_TONE: Record<DisplayStatus, "neutral" | "positive" | "attention" | "negative"> = {
  PENDING: "neutral",
  ACCEPTED_UNPAID: "attention",
  PAID: "positive",
  REJECTED: "negative",
  EXPIRED: "neutral",
};
