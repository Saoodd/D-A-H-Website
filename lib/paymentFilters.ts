// One definition of the admin payment filters, shared by the All
// Transactions page, the per-event Payments table (client-side) and the
// CSV/Excel export, so a downloaded file always contains exactly the rows
// the admin was looking at. Pure: safe on server and client.

import type { Prisma } from "@/lib/generated/prisma/client";

// "In progress" = created, pending or authorised; "Refunded" = any refund,
// full or partial.
export const PAYMENT_FILTER_STATUSES = [
  { value: "PAID", label: "Paid" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "ATTENTION", label: "Needs attention" },
] as const;
export type PaymentFilterStatus = (typeof PAYMENT_FILTER_STATUSES)[number]["value"];

// Older links and bookmarks used the stored status names.
const LEGACY_STATUS: Record<string, PaymentFilterStatus> = { SUCCEEDED: "PAID", PENDING: "IN_PROGRESS" };

export interface PaymentFilters {
  q?: string;
  status?: PaymentFilterStatus;
  eventId?: string;
  provider?: string;
  /** Calendar days (YYYY-MM-DD) in DAH's time zone, inclusive. */
  dateFrom?: string;
  dateTo?: string;
}

/** DAH operates in Dubai (UTC+4, no daylight saving), so "25 Sep" means
 *  25 Sep 00:00–24:00 Dubai time, not UTC. */
export const DAH_UTC_OFFSET = "+04:00";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validDay(v: string | null | undefined): string | undefined {
  if (!v || !DAY.test(v)) return undefined;
  return Number.isNaN(new Date(`${v}T00:00:00${DAH_UTC_OFFSET}`).getTime()) ? undefined : v;
}

/** Parses untrusted query parameters. Anything malformed is dropped rather
 *  than turned into a database error. */
export function parsePaymentFilters(params: URLSearchParams | Record<string, string | undefined>): PaymentFilters {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]) ?? undefined;
  const rawStatus = get("status") ?? "";
  const status = (LEGACY_STATUS[rawStatus] ?? rawStatus) as PaymentFilterStatus;
  const q = get("q")?.trim().slice(0, 100);
  const provider = get("provider")?.trim().slice(0, 40);
  const eventId = get("eventId")?.trim().slice(0, 64);
  return {
    ...(q ? { q } : {}),
    ...(PAYMENT_FILTER_STATUSES.some((s) => s.value === status) ? { status } : {}),
    ...(eventId ? { eventId } : {}),
    ...(provider ? { provider } : {}),
    ...(validDay(get("dateFrom")) ? { dateFrom: get("dateFrom") } : {}),
    ...(validDay(get("dateTo")) ? { dateTo: get("dateTo") } : {}),
  };
}

/** [start, end) instants for the date range. */
export function dateBounds(f: Pick<PaymentFilters, "dateFrom" | "dateTo">): { gte?: Date; lt?: Date } {
  const out: { gte?: Date; lt?: Date } = {};
  if (f.dateFrom) out.gte = new Date(`${f.dateFrom}T00:00:00${DAH_UTC_OFFSET}`);
  if (f.dateTo) out.lt = new Date(new Date(`${f.dateTo}T00:00:00${DAH_UTC_OFFSET}`).getTime() + 24 * 60 * 60 * 1000);
  return out;
}

export function paymentWhere(f: PaymentFilters): Prisma.PaymentWhereInput {
  const and: Prisma.PaymentWhereInput[] = [];
  if (f.eventId) and.push({ eventId: f.eventId });
  if (f.provider) and.push({ provider: { equals: f.provider, mode: "insensitive" } });
  if (f.dateFrom || f.dateTo) and.push({ createdAt: dateBounds(f) });
  switch (f.status) {
    case "PAID":
      and.push({ status: "SUCCEEDED" });
      break;
    case "IN_PROGRESS":
      and.push({ status: { in: ["CREATED", "PENDING", "AUTHORIZED"] } });
      break;
    case "FAILED":
    case "CANCELLED":
      and.push({ status: f.status });
      break;
    case "REFUNDED":
      and.push({ refundedAedFils: { gt: 0 } });
      break;
    case "ATTENTION":
      and.push({ needsAttention: { not: null } });
      break;
  }
  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { application: { businessName: contains } },
        { application: { contactName: contains } },
        { application: { email: contains } },
        { receiptNumber: contains },
        { providerRef: contains },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export interface FilterablePayment {
  businessName: string;
  contactName: string;
  email: string;
  receiptNumber?: string | null;
  providerRef: string | null;
  status: string;
  refundedAedFils?: number;
  needsAttention?: string | null;
  provider: string;
  createdAt: string | Date;
}

/** Client-side twin of `paymentWhere` for tables that already hold every
 *  row. Must stay in step with it; tests/paymentFilters.test.ts checks both. */
export function matchesPaymentFilters(p: FilterablePayment, f: PaymentFilters): boolean {
  if (f.provider && p.provider.toLowerCase() !== f.provider.toLowerCase()) return false;
  if (f.dateFrom || f.dateTo) {
    const t = new Date(p.createdAt).getTime();
    const { gte, lt } = dateBounds(f);
    if (gte && t < gte.getTime()) return false;
    if (lt && t >= lt.getTime()) return false;
  }
  switch (f.status) {
    case "PAID":
      if (p.status !== "SUCCEEDED") return false;
      break;
    case "IN_PROGRESS":
      if (!["CREATED", "PENDING", "AUTHORIZED"].includes(p.status)) return false;
      break;
    case "FAILED":
    case "CANCELLED":
      if (p.status !== f.status) return false;
      break;
    case "REFUNDED":
      if (!p.refundedAedFils) return false;
      break;
    case "ATTENTION":
      if (!p.needsAttention) return false;
      break;
  }
  if (f.q) {
    const needle = f.q.toLowerCase();
    const hay = [p.businessName, p.contactName, p.email, p.receiptNumber ?? "", p.providerRef ?? ""];
    if (!hay.some((h) => h.toLowerCase().includes(needle))) return false;
  }
  return true;
}

export function paymentFiltersToQuery(f: PaymentFilters): URLSearchParams {
  const qs = new URLSearchParams();
  for (const k of ["q", "status", "eventId", "provider", "dateFrom", "dateTo"] as const) if (f[k]) qs.set(k, f[k]!);
  return qs;
}
