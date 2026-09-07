"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DISPLAY_STATUS, DisplayStatus } from "@/lib/constants";

interface Row {
  id: string;
  businessName: string;
  email: string;
  eventName: string;
  createdAt: string;
  acceptanceExpiresAt: string | null;
  displayStatus: DisplayStatus;
}

const statusColor: Record<DisplayStatus, string> = {
  PENDING: "bg-cream-deep text-brown-dark",
  REJECTED: "bg-red-100 text-red-800",
  ACCEPTED_UNPAID: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-800",
  EXPIRED: "bg-zinc-200 text-zinc-700",
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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-heading text-2xl text-brown-dark">Applications</h1>
        <a
          href="/api/admin/export/applications"
          className="text-sm px-4 py-2 rounded-full border border-brown/30 hover:bg-brown/10"
        >
          Export CSV
        </a>
      </div>

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

      <div className="overflow-x-auto rounded-xl border border-brown/10">
        <table className="min-w-full text-sm bg-cream-soft">
          <thead className="bg-cream text-brown-light text-xs uppercase">
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
                  <span className={`text-xs px-2.5 py-1 rounded-full ${statusColor[a.displayStatus]}`}>
                    {a.displayStatus.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {a.displayStatus === "PENDING" && (
                    <div className="flex gap-2">
                      <button
                        disabled={busyId === a.id}
                        onClick={() => quickAction(a.id, "approve")}
                        className="text-xs px-3 py-1 rounded-full bg-green-700 text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busyId === a.id}
                        onClick={() => quickAction(a.id, "reject")}
                        className="text-xs px-3 py-1 rounded-full bg-red-700 text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
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
