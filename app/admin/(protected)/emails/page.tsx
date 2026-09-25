import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmailsAdminClient } from "./EmailsAdminClient";

export const metadata: Metadata = { title: "Emails — Admin" };

const RETRYABLE_TYPES = ["application_accepted", "application_rejected", "application_expired", "payment_receipt", "warning"];

const PAGE_LIMIT = 150;
const STATUSES = ["QUEUED", "SENT", "DELIVERED", "BOUNCED", "FAILED"];

export default async function AdminEmailsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const params = await searchParams;
  const status = STATUSES.includes(params.status ?? "") ? params.status : undefined;
  const q = (params.q ?? "").trim().slice(0, 100);
  // Filtering happens in the database so an older failed send can always
  // be found and retried, not just the ones in the latest page.
  const where = {
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { toEmail: { contains: q, mode: "insensitive" as const } },
            { type: { contains: q, mode: "insensitive" as const } },
            { vendor: { businessName: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [deliveries, total] = await Promise.all([
    prisma.emailDelivery.findMany({
      where,
      orderBy: { queuedAt: "desc" },
      take: PAGE_LIMIT,
      include: { vendor: { select: { businessName: true } } },
    }),
    prisma.emailDelivery.count({ where }),
  ]);

  return (
    <div className="max-w-5xl">
      <PageHeader title="Emails" description="Transactional email delivery log." />
      <form className="flex flex-wrap items-end gap-3 mb-3">
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Search
          <input name="q" defaultValue={q} placeholder="Recipient, vendor or email type" className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm w-64" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brown-light">
          Status
          <select name="status" defaultValue={status ?? ""} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary" size="sm">
          Filter
        </Button>
        {(status || q) && (
          <Link href="/admin/emails" className="text-xs text-brown-light underline">
            Clear
          </Link>
        )}
      </form>
      <p className="text-xs text-brown-light mb-3" role="status">
        {total > deliveries.length ? `Showing the ${deliveries.length} most recent of ${total} matching emails. Filter to find older ones.` : `${total} matching email${total === 1 ? "" : "s"}.`}
      </p>
      <EmailsAdminClient
        deliveries={deliveries.map((d) => ({
          id: d.id,
          type: d.type,
          toEmail: d.toEmail,
          vendorBusinessName: d.vendor?.businessName ?? null,
          status: d.status,
          failReason: d.failReason,
          queuedAt: d.queuedAt.toISOString(),
          sentAt: d.sentAt ? d.sentAt.toISOString() : null,
          deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
          retryable: d.status === "FAILED" && !!d.dedupeKey && RETRYABLE_TYPES.includes(d.dedupeKey.split(":")[0]),
        }))}
      />
    </div>
  );
}
