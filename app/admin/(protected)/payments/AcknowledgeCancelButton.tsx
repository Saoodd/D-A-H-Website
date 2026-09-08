"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function AcknowledgeCancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="destructive"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/admin/cancellations/${id}/acknowledge`, { method: "POST" });
        router.refresh();
      }}
    >
      Mark handled
    </Button>
  );
}
