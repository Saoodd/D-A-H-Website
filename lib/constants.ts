// Canonical status/enum-like value lists. SQLite (via Prisma) stores these as
// plain strings — this file is the single source of truth for what's valid.

export const EVENT_STATUS = ["DRAFT", "PUBLISHED", "CLOSED"] as const;
export type EventStatus = (typeof EVENT_STATUS)[number];

export const BOOTH_STATUS = ["AVAILABLE", "HELD", "RESERVED", "SOLD"] as const;
export type BoothStatus = (typeof BOOTH_STATUS)[number];

export const HOLD_STAGE = ["REVIEW", "PAYMENT"] as const;
export type HoldStage = (typeof HOLD_STAGE)[number];

export const APPLICATION_STATUS = [
  "PENDING",
  "REJECTED",
  "ACCEPTED",
  "ACCEPTANCE_EXPIRED",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number];

export const PAYMENT_STATUS = ["PENDING", "SUCCEEDED", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const CANCELLATION_STATUS = ["PENDING", "ACKNOWLEDGED"] as const;
export type CancellationStatus = (typeof CANCELLATION_STATUS)[number];

export const FEATURE_TYPE = [
  "ENTRANCE_MAIN",
  "ENTRANCE_SIDE",
  "TOILET_FEMALE",
  "TOILET_MALE",
  "OFFICE",
  "LOADING",
  "STAIRS",
  "OTHER",
] as const;
export type FeatureType = (typeof FEATURE_TYPE)[number];

// Fixed list of business categories offered on vendor account signup — this
// describes the vendor's own business, distinct from Event.categories
// (the categories DAH is looking for at a specific market).
export const VENDOR_CATEGORIES = [
  "Food and Beverage",
  "Retail",
  "Perfume",
  "Beauty & Wellness",
  "Fashion & Apparel",
  "Home & Lifestyle",
  "Art & Crafts",
  "Other",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

// Timing rules (see build spec: "Booth reservation & holds"). There are
// three independent timers and only the shortest applicable one governs at
// any moment — see lib/expiry.ts and the booth hold/checkout routes:
//   A. Application.acceptanceExpiresAt — the absolute 3-hour (default)
//      outer deadline for the whole booking process, set on admin accept.
//   B. BOOTH_SELECTION_SESSION_MINUTES — a 2-minute session on the booth
//      SELECTOR screen itself, before any booth is held. Browsing doesn't
//      reserve anything; only an explicit Confirm Booth progresses into a
//      hold. Never extends the acceptance deadline.
//   C. BOOTH_PAYMENT_HOLD_MINUTES — once Event Terms are accepted and the
//      vendor enters the payment stage, the booth is held exclusively for
//      this shorter window. Never extends the acceptance deadline either.
// Between a confirmed booth and reaching the payment stage (i.e. while
// reviewing the booking / accepting Event Terms), the booth's hold is
// bounded by the outer acceptance deadline only — see the hold route.
export const BOOTH_SELECTION_SESSION_MINUTES = 2;
export const BOOTH_PAYMENT_HOLD_MINUTES = 5;

// UAE VAT rate, used only to back out a Booth Price / VAT / Total display
// breakdown for a tier whose stored price already includes VAT — the
// charged total is always the stored price itself, unaffected by this.
export const VAT_RATE = 0.05;

/** Splits a VAT-inclusive total (in fils) into its base price and VAT
 *  portions, for display only. Never changes what gets charged. */
export function splitVatInclusiveTotal(totalAedFils: number): { baseAedFils: number; vatAedFils: number } {
  const baseAedFils = Math.round(totalAedFils / (1 + VAT_RATE));
  return { baseAedFils, vatAedFils: totalAedFils - baseAedFils };
}

// "Display status" combines Application.status + booth/payment state into the
// single filterable status the admin panel and vendor dashboard show:
// Pending / Rejected / Accepted-Unpaid / Paid / Expired.
export const DISPLAY_STATUS = [
  "PENDING",
  "REJECTED",
  "ACCEPTED_UNPAID",
  "PAID",
  "EXPIRED",
] as const;
export type DisplayStatus = (typeof DISPLAY_STATUS)[number];

export function filsToAed(fils: number): number {
  return Math.round(fils) / 100;
}

export function formatAed(fils: number): string {
  return `AED ${filsToAed(fils).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
