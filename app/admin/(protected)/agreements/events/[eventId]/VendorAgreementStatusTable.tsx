"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Card";

interface Row {
  applicationId: string;
  businessName: string;
  contactName: string;
  username: string;
  boothCode: string | null;
  displayStatus: string;
  agreementAccepted: boolean;
  acceptedVersion: number | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  acceptanceRecordId: string | null;
}

const displayStatusTone: Record<string, "neutral" | "positive" | "attention" | "negative"> = {
  PAID: "positive",
  ACCEPTED_UNPAID: "attention",
};

// Plain, non-technical wording throughout — never the raw internal status
// value (e.g. "ACCEPTED_UNPAID").
const displayStatusLabel: Record<string, string> = {
  PAID: "Confirmed",
  ACCEPTED_UNPAID: "Awaiting Payment",
};

export function VendorAgreementStatusTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) => r.businessName.toLowerCase().includes(needle) || r.contactName.toLowerCase().includes(needle) || r.username.toLowerCase().includes(needle)
    );
  }, [rows, q]);

  if (rows.length === 0) {
    return <EmptyState title="No accepted vendors yet" description="Once an application is accepted for this event, it will appear here to track Event Terms status." />;
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search business, contact or username…"
        className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft text-sm w-72 mb-4"
      />

      {filtered.length === 0 ? (
        <EmptyState title="No vendors match this search" />
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-brown-light border-b border-brown/10">
                <th className="px-1 py-2 font-medium">Business</th>
                <th className="px-1 py-2 font-medium">Contact</th>
                <th className="px-1 py-2 font-medium">Username</th>
                <th className="px-1 py-2 font-medium">Booth</th>
                <th className="px-1 py-2 font-medium">Application Status</th>
                <th className="px-1 py-2 font-medium">Agreement Status</th>
                <th className="px-1 py-2 font-medium">Signed By</th>
                <th className="px-1 py-2 font-medium">Signed At</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const clickable = !!r.acceptanceRecordId;
                function open() {
                  if (r.acceptanceRecordId) router.push(`/admin/agreements/records/${r.acceptanceRecordId}`);
                }
                return (
                  <tr
                    key={r.applicationId}
                    onClick={clickable ? open : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter") open();
                          }
                        : undefined
                    }
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? "button" : undefined}
                    className={`border-b border-brown/5 last:border-0 ${clickable ? "cursor-pointer hover:bg-brown/5 focus:outline-none focus:bg-brown/5" : ""}`}
                  >
                    <td className="px-1 py-3 text-brown-dark font-medium">{r.businessName}</td>
                    <td className="px-1 py-3 text-brown-dark">{r.contactName}</td>
                    <td className="px-1 py-3 text-brown-light">@{r.username}</td>
                    <td className="px-1 py-3 text-brown-light">{r.boothCode ?? "—"}</td>
                    <td className="px-1 py-3">
                      <StatusBadge label={displayStatusLabel[r.displayStatus] ?? r.displayStatus} tone={displayStatusTone[r.displayStatus] ?? "neutral"} />
                    </td>
                    <td className="px-1 py-3">
                      <StatusBadge
                        label={r.agreementAccepted ? `Accepted (v${r.acceptedVersion})` : "Not Signed"}
                        tone={r.agreementAccepted ? "positive" : "attention"}
                      />
                    </td>
                    <td className="px-1 py-3 text-brown-light">{r.acceptedBy ?? "—"}</td>
                    <td className="px-1 py-3 text-brown-light whitespace-nowrap">{r.acceptedAt ? new Date(r.acceptedAt).toLocaleString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
