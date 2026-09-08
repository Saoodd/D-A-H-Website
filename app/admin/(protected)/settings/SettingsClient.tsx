"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/Card";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 pb-6 border-b border-brown/10 last:border-b-0 last:pb-0">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

export function SettingsClient({
  mainCommunityWhatsappLink,
  defaultAcceptanceDeadlineHours,
  contactEmail,
  contactInstagramHandle,
  tradeLicenseRequired,
}: {
  mainCommunityWhatsappLink: string | null;
  defaultAcceptanceDeadlineHours: number;
  contactEmail: string | null;
  contactInstagramHandle: string | null;
  tradeLicenseRequired: boolean;
}) {
  const router = useRouter();
  const [link, setLink] = useState(mainCommunityWhatsappLink || "");
  const [hours, setHours] = useState(String(defaultAcceptanceDeadlineHours));
  const [email, setEmail] = useState(contactEmail || "");
  const [instagram, setInstagram] = useState(contactInstagramHandle || "");
  const [licenseRequired, setLicenseRequired] = useState(tradeLicenseRequired);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainCommunityWhatsappLink: link,
          defaultAcceptanceDeadlineHours: Number(hours),
          contactEmail: email,
          contactInstagramHandle: instagram,
          tradeLicenseRequired: licenseRequired,
        }),
      });
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 bg-cream rounded-[10px] border border-brown/10 p-6">
      <Section title="Contact">
        <label className="flex flex-col gap-1 text-sm">
          Contact email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@daralhay.ae" className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
          <span className="text-xs text-brown-light">Shown on the public Contact page.</span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Instagram handle
          <div className="flex items-center border border-brown/20 rounded-lg bg-cream-soft overflow-hidden focus-within:ring-1 focus-within:ring-brown w-56">
            <span className="pl-3 pr-1 text-brown-light select-none">@</span>
            <input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
              placeholder="daralhay"
              className="flex-1 min-w-0 px-1 py-2 pr-3 bg-transparent outline-none"
            />
          </div>
          <span className="text-xs text-brown-light">Shown on the public Contact page.</span>
        </label>
      </Section>

      <Section title="Community">
        <label className="flex flex-col gap-1 text-sm">
          Main DAH Community Group (WhatsApp link)
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://chat.whatsapp.com/…" className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft" />
          <span className="text-xs text-brown-light">
            Shown as a button on the public Contact page, and visible to every registered vendor in their dashboard.
          </span>
        </label>
      </Section>

      <Section title="Vendor rules">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={licenseRequired} onChange={(e) => setLicenseRequired(e.target.checked)} />
          Require a trade license to become a vendor
        </label>
        <p className="text-xs text-brown-light">
          Controls the wording on the vendor registration page and the Terms &amp; Conditions — one switch, so they can
          never contradict each other. Off means optional (current default).
        </p>
      </Section>

      <Section title="Acceptance">
        <label className="flex flex-col gap-1 text-sm">
          Default acceptance/payment deadline (hours)
          <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft w-40" />
          <span className="text-xs text-brown-light">
            Applies to future approvals unless overridden per-event or at the moment of approval.
          </span>
        </label>
      </Section>

      {saved && <p className="text-sm text-emerald-700">Saved.</p>}

      <Button onClick={save} loading={busy}>
        Save settings
      </Button>
    </div>
  );
}
