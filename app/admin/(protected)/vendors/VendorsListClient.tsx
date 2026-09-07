"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Vendor {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  category: string;
  description: string;
  instagram: string | null;
  verified: boolean;
  applicationCount: number;
  createdAt: string;
}

export function VendorsListClient({ vendors, activeStatus }: { vendors: Vendor[]; activeStatus: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setVerified(id: string, verified: boolean) {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-heading text-2xl text-brown-dark">Vendors</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href="/admin/vendors"
          className={`text-xs px-3 py-1.5 rounded-full border ${!activeStatus ? "bg-brown text-cream-soft border-brown" : "border-brown/30"}`}
        >
          All
        </Link>
        <Link
          href="/admin/vendors?status=unverified"
          className={`text-xs px-3 py-1.5 rounded-full border ${activeStatus === "unverified" ? "bg-brown text-cream-soft border-brown" : "border-brown/30"}`}
        >
          Unverified
        </Link>
        <Link
          href="/admin/vendors?status=verified"
          className={`text-xs px-3 py-1.5 rounded-full border ${activeStatus === "verified" ? "bg-brown text-cream-soft border-brown" : "border-brown/30"}`}
        >
          Verified
        </Link>
      </div>

      <div className="space-y-3">
        {vendors.map((v) => (
          <div key={v.id} className="rounded-xl border border-brown/10 bg-cream-soft p-5">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-heading text-brown-dark">{v.businessName}</p>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full ${
                      v.verified ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {v.verified ? "Verified" : "Unverified"}
                  </span>
                </div>
                <p className="text-xs text-brown-light mt-1">
                  {v.contactName} · {v.email} · {v.phone}
                </p>
                <p className="text-xs text-brown-light">
                  {v.category}
                  {v.instagram && ` · ${v.instagram}`} · {v.applicationCount} application
                  {v.applicationCount === 1 ? "" : "s"}
                </p>
                {v.description && <p className="text-sm text-brown-dark mt-2 max-w-xl">{v.description}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                {v.verified ? (
                  <button
                    disabled={busyId === v.id}
                    onClick={() => setVerified(v.id, false)}
                    className="text-xs px-4 py-2 rounded-full border border-brown/30 disabled:opacity-50"
                  >
                    Unverify
                  </button>
                ) : (
                  <button
                    disabled={busyId === v.id}
                    onClick={() => setVerified(v.id, true)}
                    className="text-xs px-4 py-2 rounded-full bg-green-700 text-white disabled:opacity-50"
                  >
                    Verify
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {vendors.length === 0 && <p className="text-brown-light text-sm">No vendors found.</p>}
      </div>
    </div>
  );
}
