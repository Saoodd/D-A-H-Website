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

// Timing rules (see build spec: "Booth reservation & holds")
export const BOOTH_REVIEW_HOLD_MINUTES = 5;
export const BOOTH_PAYMENT_HOLD_MINUTES = 5;

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
