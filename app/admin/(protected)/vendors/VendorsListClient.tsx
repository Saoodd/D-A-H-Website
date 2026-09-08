"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface Vendor {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  category: string;
  instagram: string | null;
  logoUrl: string | null;
  verified: boolean;
  applicationCount: number;
  createdAt: string;
}

function buildHref(params: Record<string, string | number | undefined>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== 1) usp.set(k, String(v));
  }
  const qs = usp.toString();
  return `/admin/vendors${qs ? `?${qs}` : ""}`;
}

export function VendorsListClient({
  vendors,
  activeStatus,
  query,
  sort,
  page,
  totalPages,
  total,
}: {
  vendors: Vendor[];
  activeStatus: string;
  query: string;
  sort: string;
  page: number;
  totalPages: number;
  total: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState(query);

  async function setVerified(id: string, verified: boolean, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusyId(id);
    try {
      await fetch(`/api/admin/vendors/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(buildHref({ status: activeStatus, q, sort }));
  }

  return (
    <div>
      <PageHeader title="Vendors" description={`${total} vendor${total === 1 ? "" : "s"} on file`} />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <form onSubmit={submitSearch} className="flex-1 min-w-[220px]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search business, contact, email or phone…"
            className="w-full border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm"
          />
        </form>
        <select
          value={sort}
          onChange={(e) => router.push(buildHref({ status: activeStatus, q: query, sort: e.target.value }))}
          className="border border-brown/20 rounded-lg px-3 py-2 bg-cream text-sm"
        >
          <option value="recent">Newest first</option>
          <option value="name">Business name</option>
          <option value="applications">Most applications</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href={buildHref({ q: query, sort })}
          className={`text-xs px-3 py-1.5 rounded-full border ${!activeStatus ? "bg-brown text-cream-soft border-brown" : "border-brown/30"}`}
        >
          All
        </Link>
        <Link
          href={buildHref({ status: "unverified", q: query, sort })}
          className={`text-xs px-3 py-1.5 rounded-full border ${activeStatus === "unverified" ? "bg-brown text-cream-soft border-brown" : "border-brown/30"}`}
        >
          Unverified
        </Link>
        <Link
          href={buildHref({ status: "verified", q: query, sort })}
          className={`text-xs px-3 py-1.5 rounded-full border ${activeStatus === "verified" ? "bg-brown text-cream-soft border-brown" : "border-brown/30"}`}
        >
          Verified
        </Link>
      </div>

      {vendors.length === 0 ? (
        <EmptyState title="No vendors found" description="Try a different search or filter." />
      ) : (
        <div className="space-y-3">
          {vendors.map((v) => (
            <Link
              key={v.id}
              href={`/admin/vendors/${v.id}`}
              className="block rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-5 transition-colors"
            >
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-start gap-3">
                  {v.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vendor-uploaded logo via Blob
                    <img src={v.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-brown/10 mt-0.5" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-cream-deep flex items-center justify-center font-heading text-sm text-brown-dark mt-0.5">
                      {v.businessName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-heading text-brown-dark">{v.businessName}</p>
                      <StatusBadge label={v.verified ? "Verified" : "Unverified"} tone={v.verified ? "positive" : "attention"} />
                    </div>
                    <p className="text-xs text-brown-light mt-1">
                      {v.contactName} · {v.email} · {v.phone}
                    </p>
                    <p className="text-xs text-brown-light">
                      {v.category}
                      {v.instagram && ` · @${v.instagram.replace(/^@/, "")}`} · {v.applicationCount} application
                      {v.applicationCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {v.verified ? (
                    <button
                      disabled={busyId === v.id}
                      onClick={(e) => setVerified(v.id, false, e)}
                      className="text-xs px-4 py-2 rounded-[6px] border border-brown/30 disabled:opacity-50"
                    >
                      Unverify
                    </button>
                  ) : (
                    <button
                      disabled={busyId === v.id}
                      onClick={(e) => setVerified(v.id, true, e)}
                      className="text-xs px-4 py-2 rounded-[6px] bg-emerald-700 text-white disabled:opacity-50"
                    >
                      Verify
                    </button>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={buildHref({ status: activeStatus, q: query, sort, page: p })}
              className={`text-xs w-8 h-8 flex items-center justify-center rounded-[6px] border ${
                p === page ? "bg-brown text-cream-soft border-brown" : "border-brown/25 text-brown-dark"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
