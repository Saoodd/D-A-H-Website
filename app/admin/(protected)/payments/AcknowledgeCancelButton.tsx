"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcknowledgeCancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/admin/cancellations/${id}/acknowledge`, { method: "POST" });
        router.refresh();
      }}
      className="text-xs px-3 py-1.5 rounded-full bg-red-700 text-white disabled:opacity-50"
    >
      Mark handled
    </button>
  );
}
