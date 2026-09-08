"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DISPLAY_STATUS, DisplayStatus } from "@/lib/constants";
import { PageHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button, LinkButton } from "@/components/ui/Button";

interface Row {
  id: string;
  businessName: string;
  email: string;
  eventName: string;
  createdAt: string;
  acceptanceExpiresAt: string | null;
  displayStatus: DisplayStatus;
}

const statusTone: Record<DisplayStatus, "neutral" | "positive" | "attention" | "negative"> = {
  PENDING: "neutral",
  REJECTED: "negative",
  ACCEPTED_UNPAID: "attention",
  PAID: "positive",
  EXPIRED: "neutral",
};

export function ApplicationsListClient({ applications, activeStatus }: { applications: Row[]; activeStatus: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function quickAction(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await fetch(`/api/admin/applications/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Applications"
        actions={
          <LinkButton href="/api/admin/export/applications" variant="secondary" size="sm">
            Export CSV
          </LinkButton>
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href="/admin/applications"
          className={`text-xs px-3 py-1.5 rounded-full border ${!activeStatus ? "bg-brown text-cream-soft border-brown" : "border-brown/30"}`}
        >
          All
        </Link>
        {DISPLAY_STATUS.map((s) => (
          <Link
            key={s}
            href={`/admin/applications?status=${s}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${activeStatus === s ? "bg-brown text-cream-soft border-brown" : "border-brown/30"}`}
          >
            {s.replace("_", " ")}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-brown/10">
        <table className="min-w-full text-sm bg-cream">
          <thead className="bg-cream-deep/40 text-brown-light text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Business</th>
              <th className="text-left px-4 py-3">Event</th>
              <th className="text-left px-4 py-3">Submitted</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a.id} className="border-t border-brown/10">
                <td className="px-4 py-3">
                  <Link href={`/admin/applications/${a.id}`} className="text-brown-dark hover:underline">
                    {a.businessName}
                  </Link>
                  <p className="text-xs text-brown-light">{a.email}</p>
                </td>
                <td className="px-4 py-3">{a.eventName}</td>
                <td className="px-4 py-3 text-xs">{new Date(a.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <StatusBadge label={a.displayStatus.replace("_", " ")} tone={statusTone[a.displayStatus]} />
                </td>
                <td className="px-4 py-3">
                  {a.displayStatus === "PENDING" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => quickAction(a.id, "approve")} loading={busyId === a.id}>
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => quickAction(a.id, "reject")} loading={busyId === a.id}>
                        Reject
                      </Button>
                    </div>
                  )}
                  {a.displayStatus !== "PENDING" && (
                    <Link href={`/admin/applications/${a.id}`} className="text-xs text-brown underline">
                      Manage
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {applications.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-brown-light">
                  No applications found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
