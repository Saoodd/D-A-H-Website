"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { EMAIL_VARIABLES } from "@/lib/communications/variables";
import type { AudienceFilters, AudienceRecipient } from "@/lib/communications/audience";
import type { DisplayStatus } from "@/lib/constants";

type Channel = "EMAIL" | "WHATSAPP" | "BOTH";

interface EventOption {
  id: string;
  name: string;
  status: string;
}
interface TierOption {
  sizeKey: string;
  label: string;
}
interface WhatsAppTemplate {
  name: string;
  language: string;
  bodyText: string | null;
  variableCount: number;
  source: string;
  status: string | null;
}
type VarMapping = Record<string, { kind: "field"; field: string } | { kind: "literal"; value: string }>;

// Maps a quick-action deep-link's ?audience= keys to real DisplayStatus
// values (see lib/status.ts getDisplayStatus) — kept as an explicit,
// documented vocabulary distinct from the raw Application.status strings,
// since e.g. "accepted" is ambiguous (Accepted-and-paid is a different
// audience than Accepted-and-unpaid).
const AUDIENCE_KEY_TO_STATUS: Record<string, DisplayStatus> = {
  pending: "PENDING",
  rejected: "REJECTED",
  "accepted-unpaid": "ACCEPTED_UNPAID",
  "confirmed-paid": "PAID",
  "acceptance-expired": "EXPIRED",
};

const STATUS_LABEL: Record<DisplayStatus, string> = {
  PENDING: "Pending",
  REJECTED: "Rejected",
  ACCEPTED_UNPAID: "Accepted — Unpaid",
  PAID: "Confirmed & Paid",
  EXPIRED: "Acceptance Expired",
};

const VARIABLE_LABEL: Record<string, string> = {
  business_name: "Business Name",
  contact_name: "Contact Name",
  event_name: "Event Name",
  event_date: "Event Date",
  venue: "Venue",
  booth: "Booth",
  amount_paid: "Amount Paid",
  amount_due: "Amount Due",
  acceptance_deadline: "Acceptance Deadline",
  booking_url: "Booking URL",
};

function emptyFilters(eventId: string | null, statuses: DisplayStatus[]): AudienceFilters {
  return {
    eventId,
    displayStatuses: statuses,
    boothTierKeys: [],
    boothCodes: [],
    boothRangeFrom: null,
    boothRangeTo: null,
    vendorCategories: [],
    businessNameQuery: null,
    phoneVerifiedOnly: false,
    whatsappOptedInOnly: false,
    applicationDateFrom: null,
    applicationDateTo: null,
    paymentDateFrom: null,
    paymentDateTo: null,
    manualVendorIds: null,
    excludeVendorIds: [],
    includeVendorIds: [],
  };
}

export function ComposeClient({
  events,
  tiers,
  vendorCategories,
  initialEventId,
  initialAudience,
}: {
  events: EventOption[];
  tiers: TierOption[];
  vendorCategories: string[];
  initialEventId: string | null;
  initialAudience: string[];
}) {
  const router = useRouter();
  const initialStatuses = initialAudience.map((k) => AUDIENCE_KEY_TO_STATUS[k]).filter(Boolean) as DisplayStatus[];

  const [channel, setChannel] = useState<Channel>("EMAIL");
  const [eventId, setEventId] = useState<string | null>(initialEventId);
  const [displayStatuses, setDisplayStatuses] = useState<DisplayStatus[]>(initialStatuses);
  const [boothTierKeys, setBoothTierKeys] = useState<string[]>([]);
  const [boothCodesText, setBoothCodesText] = useState("");
  const [boothRangeFrom, setBoothRangeFrom] = useState("");
  const [boothRangeTo, setBoothRangeTo] = useState("");
  const [vendorCategoriesSel, setVendorCategoriesSel] = useState<string[]>([]);
  const [businessNameQuery, setBusinessNameQuery] = useState("");
  const [phoneVerifiedOnly, setPhoneVerifiedOnly] = useState(false);
  const [whatsappOptedInOnly, setWhatsappOptedInOnly] = useState(false);

  const [manualMode, setManualMode] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<{ id: string; businessName: string; email: string }[]>([]);
  const [manualSelected, setManualSelected] = useState<Map<string, string>>(new Map());

  const [excludeIds, setExcludeIds] = useState<Set<string>>(new Set());
  const [includeIds, setIncludeIds] = useState<Map<string, string>>(new Map());

  const [internalName, setInternalName] = useState("");
  const [sentByName, setSentByName] = useState("");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("dah_admin_name") : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a per-browser convenience value, not derived render state
    if (saved) setSentByName(saved);
  }, []);

  const [emailSubject, setEmailSubject] = useState("");
  const [emailBodyHtml, setEmailBodyHtml] = useState("");

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templatesConfigured, setTemplatesConfigured] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [variableMapping, setVariableMapping] = useState<VarMapping>({});

  const [preview, setPreview] = useState<{ totalCount: number; emailEligibleCount: number; whatsappEligibleCount: number; summary: string; recipients: AudienceRecipient[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [addVendorQuery, setAddVendorQuery] = useState("");
  const [addVendorResults, setAddVendorResults] = useState<{ id: string; businessName: string; email: string }[]>([]);

  const [communicationId, setCommunicationId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [largeSendAck, setLargeSendAck] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "positive" | "negative" | "neutral"; text: string } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const eventName = useMemo(() => events.find((e) => e.id === eventId)?.name ?? null, [events, eventId]);

  const filters: AudienceFilters = useMemo(() => {
    const base = emptyFilters(eventId, displayStatuses);
    return {
      ...base,
      boothTierKeys,
      boothCodes: boothCodesText.split(",").map((c) => c.trim()).filter(Boolean),
      boothRangeFrom: boothRangeFrom.trim() || null,
      boothRangeTo: boothRangeTo.trim() || null,
      vendorCategories: vendorCategoriesSel,
      businessNameQuery: businessNameQuery.trim() || null,
      phoneVerifiedOnly,
      whatsappOptedInOnly,
      manualVendorIds: manualMode ? Array.from(manualSelected.keys()) : null,
      excludeVendorIds: Array.from(excludeIds),
      includeVendorIds: Array.from(includeIds.keys()),
    };
  }, [eventId, displayStatuses, boothTierKeys, boothCodesText, boothRangeFrom, boothRangeTo, vendorCategoriesSel, businessNameQuery, phoneVerifiedOnly, whatsappOptedInOnly, manualMode, manualSelected, excludeIds, includeIds]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/admin/communications/audience-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters }),
        });
        const data = await res.json();
        if (res.ok) setPreview(data);
      } finally {
        setPreviewLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters]);

  useEffect(() => {
    if (channel === "EMAIL") return;
    fetch("/api/admin/whatsapp-templates")
      .then((r) => r.json())
      .then((data) => {
        setTemplatesConfigured(data.configured !== false);
        setTemplatesError(data.error || null);
        setTemplates(data.templates || []);
      });
  }, [channel]);

  async function searchVendors(query: string, setter: (r: { id: string; businessName: string; email: string }[]) => void) {
    if (!query.trim()) {
      setter([]);
      return;
    }
    const res = await fetch(`/api/admin/vendors?query=${encodeURIComponent(query)}`).catch(() => null);
    if (!res || !res.ok) return;
    const data = await res.json().catch(() => null);
    const list = Array.isArray(data?.vendors) ? data.vendors : Array.isArray(data) ? data : [];
    setter(list.slice(0, 20).map((v: { id: string; businessName: string; email: string }) => ({ id: v.id, businessName: v.businessName, email: v.email })));
  }

  useEffect(() => {
    const t = setTimeout(() => searchVendors(manualSearch, setManualResults), 300);
    return () => clearTimeout(t);
  }, [manualSearch]);

  useEffect(() => {
    const t = setTimeout(() => searchVendors(addVendorQuery, setAddVendorResults), 300);
    return () => clearTimeout(t);
  }, [addVendorQuery]);

  function toggleStatus(s: DisplayStatus) {
    setDisplayStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  function toggleTier(key: string) {
    setBoothTierKeys((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }
  function toggleCategory(c: string) {
    setVendorCategoriesSel((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function insertEmailVariable(v: string) {
    setEmailBodyHtml((prev) => `${prev}<p>{{${v}}}</p>`);
  }

  function setVarField(idx: number, field: string) {
    setVariableMapping((prev) => ({ ...prev, [String(idx)]: { kind: "field", field } }));
  }
  function setVarLiteral(idx: number, value: string) {
    setVariableMapping((prev) => ({ ...prev, [String(idx)]: { kind: "literal", value } }));
  }

  async function ensureDraft(): Promise<string | null> {
    if (!internalName.trim()) {
      setNotice({ tone: "negative", text: "Give this communication an internal name first." });
      return null;
    }
    if (typeof window !== "undefined" && sentByName.trim()) window.localStorage.setItem("dah_admin_name", sentByName.trim());

    const payload = {
      internalName,
      sentByName,
      channel,
      filters,
      emailSubject: channel !== "WHATSAPP" ? emailSubject : undefined,
      emailBodyHtml: channel !== "WHATSAPP" ? emailBodyHtml : undefined,
      whatsappTemplateName: channel !== "EMAIL" ? selectedTemplate?.name : undefined,
      whatsappTemplateLanguage: channel !== "EMAIL" ? selectedTemplate?.language : undefined,
      whatsappVariablesJson: channel !== "EMAIL" ? JSON.stringify(variableMapping) : undefined,
    };

    setSaving(true);
    try {
      if (!communicationId) {
        const res = await fetch("/api/admin/communications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) {
          setNotice({ tone: "negative", text: data.error || "Couldn't save this draft." });
          return null;
        }
        setCommunicationId(data.communication.id);
        return data.communication.id as string;
      } else {
        const res = await fetch(`/api/admin/communications/${communicationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) {
          setNotice({ tone: "negative", text: data.error || "Couldn't save this draft." });
          return null;
        }
        return communicationId;
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    const id = await ensureDraft();
    if (!id) return;
    if (!testEmail && !testPhone) {
      setNotice({ tone: "negative", text: "Enter a test email and/or test phone number." });
      return;
    }
    setTestBusy(true);
    try {
      const res = await fetch(`/api/admin/communications/${id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ testEmail, testPhone }) });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ tone: "negative", text: data.error || "Test send failed." });
        return;
      }
      const parts: string[] = [];
      if (data.email) parts.push(`Email: ${data.email.ok ? "sent" : "failed"}`);
      if (data.whatsapp) parts.push(`WhatsApp: ${data.whatsapp.ok ? "sent" : `failed — ${data.whatsapp.error || ""}`}`);
      setNotice({ tone: "positive", text: `Test sent. ${parts.join(" · ")}` });
    } finally {
      setTestBusy(false);
    }
  }

  async function openConfirm() {
    const id = await ensureDraft();
    if (!id) return;
    setLargeSendAck(false);
    setConfirmOpen(true);
  }

  async function handleSend() {
    if (!communicationId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/communications/${communicationId}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ tone: "negative", text: data.error || "Send failed." });
        setConfirmOpen(false);
        return;
      }
      router.push(`/admin/communications/${communicationId}`);
    } finally {
      setSending(false);
    }
  }

  const recipientsFiltered = (preview?.recipients || []).filter(
    (r) => !recipientSearch.trim() || r.businessName.toLowerCase().includes(recipientSearch.toLowerCase()) || r.contactName.toLowerCase().includes(recipientSearch.toLowerCase())
  );

  const isLargeSend = (preview?.totalCount || 0) > 100;
  const canSend = (preview?.totalCount || 0) > 0 && internalName.trim().length > 0 && (channel === "EMAIL" ? emailSubject.trim() && emailBodyHtml.trim() : channel === "WHATSAPP" ? !!selectedTemplate : emailSubject.trim() && emailBodyHtml.trim() && !!selectedTemplate);

  return (
    <div className="space-y-6 pb-24">
      {notice && (
        <div className={`rounded-[8px] px-4 py-3 text-sm ${notice.tone === "positive" ? "bg-emerald-700/10 text-emerald-800" : notice.tone === "negative" ? "bg-red-800/10 text-red-800" : "bg-brown/10 text-brown-dark"}`}>
          {notice.text}
        </div>
      )}

      {/* 1. Channel */}
      <Card className="p-5">
        <p className="label-caps mb-3">Channel</p>
        <div className="flex flex-wrap gap-2">
          {(["EMAIL", "WHATSAPP", "BOTH"] as Channel[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`px-4 py-2 rounded-[6px] text-sm border transition-colors ${channel === c ? "bg-brown text-cream-soft border-brown" : "border-brown/20 text-brown-dark hover:bg-brown/5"}`}
            >
              {c === "EMAIL" ? "Email" : c === "WHATSAPP" ? "WhatsApp" : "Email + WhatsApp"}
            </button>
          ))}
        </div>
      </Card>

      {/* 2. Internal name + sender */}
      <Card className="p-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-brown-dark">Internal name</label>
            <input value={internalName} onChange={(e) => setInternalName(e.target.value)} placeholder='e.g. "Vol 5 Setup Instructions"' className="mt-1 w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
            <p className="text-[11px] text-brown-light mt-1">Not shown to vendors — makes History easier to scan.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-brown-dark">Your name (for the record)</label>
            <input value={sentByName} onChange={(e) => setSentByName(e.target.value)} placeholder="e.g. Sara" className="mt-1 w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
          </div>
        </div>
      </Card>

      {/* 3. Audience */}
      <Card className="p-5 space-y-5">
        <p className="label-caps">Audience</p>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setManualMode(false)} className={`text-sm px-3 py-1.5 rounded-[6px] ${!manualMode ? "bg-brown/10 text-brown-dark font-medium" : "text-brown-light"}`}>
            Filtered audience
          </button>
          <button type="button" onClick={() => setManualMode(true)} className={`text-sm px-3 py-1.5 rounded-[6px] ${manualMode ? "bg-brown/10 text-brown-dark font-medium" : "text-brown-light"}`}>
            Manual selection
          </button>
        </div>

        {manualMode ? (
          <div>
            <input
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              placeholder="Search vendors/businesses…"
              className="w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm"
            />
            {manualResults.length > 0 && (
              <div className="mt-2 border border-brown/10 rounded-[8px] divide-y divide-brown/10 max-h-56 overflow-y-auto">
                {manualResults.map((v) => (
                  <label key={v.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-brown/5">
                    <input
                      type="checkbox"
                      checked={manualSelected.has(v.id)}
                      onChange={(e) => {
                        setManualSelected((prev) => {
                          const next = new Map(prev);
                          if (e.target.checked) next.set(v.id, v.businessName);
                          else next.delete(v.id);
                          return next;
                        });
                      }}
                    />
                    {v.businessName} <span className="text-brown-light text-xs">({v.email})</span>
                  </label>
                ))}
              </div>
            )}
            {manualSelected.size > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Array.from(manualSelected.entries()).map(([id, name]) => (
                  <span key={id} className="inline-flex items-center gap-1 text-xs bg-brown/10 text-brown-dark rounded-full px-2.5 py-1">
                    {name}
                    <button type="button" onClick={() => setManualSelected((prev) => { const n = new Map(prev); n.delete(id); return n; })} className="text-brown-light">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-brown-dark">Event</label>
              <select value={eventId ?? ""} onChange={(e) => setEventId(e.target.value || null)} className="mt-1 w-full sm:w-72 rounded-[6px] border border-brown/20 px-3 py-2 text-sm">
                <option value="">All Events</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              {!eventId && <p className="text-[11px] text-amber-800 mt-1">⚠ Messaging across ALL events — double-check this is intended.</p>}
            </div>

            <div>
              <p className="text-xs font-medium text-brown-dark mb-1.5">Application / booking / payment status</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(STATUS_LABEL) as DisplayStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${displayStatuses.includes(s) ? "bg-brown text-cream-soft border-brown" : "border-brown/20 text-brown-dark hover:bg-brown/5"}`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            {tiers.length > 0 && (
              <div>
                <p className="text-xs font-medium text-brown-dark mb-1.5">Booth tier</p>
                <div className="flex flex-wrap gap-1.5">
                  {tiers.map((t) => (
                    <button
                      key={t.sizeKey}
                      type="button"
                      onClick={() => toggleTier(t.sizeKey)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${boothTierKeys.includes(t.sizeKey) ? "bg-brown text-cream-soft border-brown" : "border-brown/20 text-brown-dark hover:bg-brown/5"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-brown-dark">Specific booths (comma-separated)</label>
                <input value={boothCodesText} onChange={(e) => setBoothCodesText(e.target.value)} placeholder="B1, B3, B7" className="mt-1 w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-brown-dark">Booth range — from</label>
                <input value={boothRangeFrom} onChange={(e) => setBoothRangeFrom(e.target.value)} placeholder="B1" className="mt-1 w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-brown-dark">Booth range — to</label>
                <input value={boothRangeTo} onChange={(e) => setBoothRangeTo(e.target.value)} placeholder="B20" className="mt-1 w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
              </div>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-brown-dark font-medium">More filters</summary>
              <div className="mt-3 space-y-4">
                <div>
                  <p className="text-xs font-medium text-brown-dark mb-1.5">Vendor category</p>
                  <div className="flex flex-wrap gap-1.5">
                    {vendorCategories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCategory(c)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${vendorCategoriesSel.includes(c) ? "bg-brown text-cream-soft border-brown" : "border-brown/20 text-brown-dark hover:bg-brown/5"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-brown-dark">Business name contains</label>
                  <input value={businessNameQuery} onChange={(e) => setBusinessNameQuery(e.target.value)} className="mt-1 w-full sm:w-72 rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={phoneVerifiedOnly} onChange={(e) => setPhoneVerifiedOnly(e.target.checked)} /> Phone verified only
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={whatsappOptedInOnly} onChange={(e) => setWhatsappOptedInOnly(e.target.checked)} /> WhatsApp opted-in only
                </label>
              </div>
            </details>
          </div>
        )}

        {/* Recipient summary */}
        <div className="border-t border-brown/10 pt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-brown-dark">{preview?.summary || "…"}</p>
            <p className="font-heading text-xl text-brown-dark mt-1">
              {previewLoading ? "…" : `${preview?.totalCount ?? 0} recipient${(preview?.totalCount ?? 0) === 1 ? "" : "s"}`}
            </p>
            {preview && preview.totalCount > 0 && (
              <p className="text-xs text-brown-light mt-1">
                Email eligible: {preview.emailEligibleCount} · WhatsApp eligible: {preview.whatsappEligibleCount}
              </p>
            )}
            {preview && preview.totalCount > 0 && preview.totalCount > preview.emailEligibleCount && channel !== "WHATSAPP" && (
              <p className="text-xs text-amber-800 mt-1">{preview.totalCount - preview.emailEligibleCount} missing a usable email.</p>
            )}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setRecipientsOpen(true)} disabled={!preview || preview.totalCount === 0}>
            View Recipients
          </Button>
        </div>
      </Card>

      {/* 4. Email composer */}
      {(channel === "EMAIL" || channel === "BOTH") && (
        <Card className="p-5 space-y-4">
          <p className="label-caps">Email</p>
          <div>
            <label className="text-xs font-medium text-brown-dark">Subject</label>
            <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="mt-1 w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-brown-dark">Message</label>
              <select onChange={(e) => e.target.value && (insertEmailVariable(e.target.value), (e.target.value = ""))} className="text-xs border border-brown/20 rounded-[6px] px-2 py-1" defaultValue="">
                <option value="" disabled>
                  Insert Variable…
                </option>
                {EMAIL_VARIABLES.map((v) => (
                  <option key={v} value={v}>
                    {VARIABLE_LABEL[v]}
                  </option>
                ))}
              </select>
            </div>
            <RichTextEditor value={emailBodyHtml} onChange={setEmailBodyHtml} />
          </div>
          <div>
            <label className="text-xs font-medium text-brown-dark">Send Test Email to Myself</label>
            <div className="flex gap-2 mt-1">
              <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" className="flex-1 rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
            </div>
          </div>
        </Card>
      )}

      {/* 5. WhatsApp composer */}
      {(channel === "WHATSAPP" || channel === "BOTH") && (
        <Card className="p-5 space-y-4">
          <p className="label-caps">WhatsApp Template</p>
          {!templatesConfigured && <p className="text-sm text-amber-800 bg-amber-500/10 rounded-[8px] px-4 py-3">{templatesError}</p>}
          <select
            value={selectedTemplate ? `${selectedTemplate.name}::${selectedTemplate.language}` : ""}
            onChange={(e) => {
              const t = templates.find((t) => `${t.name}::${t.language}` === e.target.value);
              setSelectedTemplate(t || null);
              setVariableMapping({});
            }}
            className="w-full sm:w-96 rounded-[6px] border border-brown/20 px-3 py-2 text-sm"
          >
            <option value="">Select Template…</option>
            {templates.map((t) => (
              <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                {t.name} ({t.language}) {t.source === "MANUAL" ? "— unverified" : ""}
              </option>
            ))}
          </select>

          {selectedTemplate && (
            <div className="space-y-3">
              {selectedTemplate.bodyText && <p className="text-sm bg-cream-deep/30 rounded-[6px] px-3 py-2 whitespace-pre-wrap">{selectedTemplate.bodyText}</p>}
              {Array.from({ length: selectedTemplate.variableCount }, (_, i) => i + 1).map((idx) => {
                const current = variableMapping[String(idx)];
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-brown-light w-10">{`{{${idx}}}`}</span>
                    <select
                      value={current?.kind === "field" ? current.field : current?.kind === "literal" ? "__literal__" : ""}
                      onChange={(e) => (e.target.value === "__literal__" ? setVarLiteral(idx, "") : setVarField(idx, e.target.value))}
                      className="rounded-[6px] border border-brown/20 px-2 py-1.5 text-sm"
                    >
                      <option value="" disabled>
                        Map to…
                      </option>
                      {EMAIL_VARIABLES.map((v) => (
                        <option key={v} value={v}>
                          {VARIABLE_LABEL[v]}
                        </option>
                      ))}
                      <option value="__literal__">Custom text…</option>
                    </select>
                    {current?.kind === "literal" && (
                      <input value={current.value} onChange={(e) => setVarLiteral(idx, e.target.value)} className="flex-1 rounded-[6px] border border-brown/20 px-2 py-1.5 text-sm" placeholder="Enter text…" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-brown-dark">Send Test WhatsApp to a number</label>
            <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+9715XXXXXXXX" className="mt-1 w-full sm:w-72 rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
          </div>
        </Card>
      )}

      {/* Test + Send actions */}
      <div className="fixed bottom-0 left-0 right-0 md:left-56 bg-cream/95 backdrop-blur border-t border-brown/10 px-5 py-3 flex flex-wrap items-center justify-end gap-2 z-30">
        <Button type="button" variant="secondary" onClick={handleSendTest} loading={testBusy}>
          Send Test
        </Button>
        <Button type="button" onClick={openConfirm} loading={saving} disabled={!canSend}>
          Preview &amp; Send
        </Button>
      </div>

      {/* View Recipients modal */}
      {recipientsOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setRecipientsOpen(false)} />
          <div className="relative bg-cream rounded-[12px] border border-brown/10 max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="font-heading text-lg text-brown-dark">{preview.totalCount} vendors selected</p>
              <button type="button" onClick={() => setRecipientsOpen(false)} className="text-brown-light text-xl leading-none">
                ×
              </button>
            </div>
            <input value={recipientSearch} onChange={(e) => setRecipientSearch(e.target.value)} placeholder="Search recipients…" className="w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm mb-3" />
            <div className="mb-4">
              <p className="text-xs font-medium text-brown-dark mb-1">Add an eligible vendor manually</p>
              <input value={addVendorQuery} onChange={(e) => setAddVendorQuery(e.target.value)} placeholder="Search by business name…" className="w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
              {addVendorResults.length > 0 && (
                <div className="mt-1 border border-brown/10 rounded-[6px] divide-y divide-brown/10 max-h-32 overflow-y-auto">
                  {addVendorResults.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setIncludeIds((prev) => new Map(prev).set(v.id, v.businessName));
                        setExcludeIds((prev) => {
                          const n = new Set(prev);
                          n.delete(v.id);
                          return n;
                        });
                        setAddVendorQuery("");
                        setAddVendorResults([]);
                      }}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-brown/5"
                    >
                      + {v.businessName} <span className="text-brown-light text-xs">({v.email})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="border border-brown/10 rounded-[8px] divide-y divide-brown/10">
              {recipientsFiltered.map((r) => (
                <div key={r.vendorId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-brown-dark font-medium">{r.businessName}</p>
                    <p className="text-xs text-brown-light">
                      {r.contactName} · {r.email} · {r.phone}
                      {r.boothCodes.length > 0 && ` · ${r.boothCodes.join(", ")}`}
                      {r.displayStatus && ` · ${STATUS_LABEL[r.displayStatus]}`}
                    </p>
                    <p className="text-[11px] mt-0.5">
                      <span className={r.emailEligible ? "text-emerald-700" : "text-brown-light"}>Email: {r.emailEligible ? "Eligible" : r.emailIneligibleReason}</span>
                      {" · "}
                      <span className={r.whatsappEligible ? "text-emerald-700" : "text-brown-light"}>WhatsApp: {r.whatsappEligible ? "Eligible" : r.whatsappIneligibleReason}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExcludeIds((prev) => new Set(prev).add(r.vendorId));
                      setIncludeIds((prev) => {
                        const n = new Map(prev);
                        n.delete(r.vendorId);
                        return n;
                      });
                    }}
                    className="text-xs text-red-800 underline shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Send confirmation */}
      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/40" onClick={() => !sending && setConfirmOpen(false)} />
          <div className="relative bg-cream rounded-[12px] border border-brown/10 max-w-lg w-full p-6">
            <p className="font-heading text-lg text-brown-dark mb-4">Send Communication</p>
            <dl className="space-y-2 text-sm mb-5">
              <div className="flex justify-between">
                <dt className="text-brown-light">Event</dt>
                <dd className="text-brown-dark">{eventName || "All Events"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brown-light">Audience</dt>
                <dd className="text-brown-dark text-right">{preview.summary}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brown-light">Recipients</dt>
                <dd className="text-brown-dark font-medium">{preview.totalCount}</dd>
              </div>
              {(channel === "EMAIL" || channel === "BOTH") && (
                <div className="flex justify-between">
                  <dt className="text-brown-light">Email</dt>
                  <dd className="text-brown-dark">Enabled — {preview.emailEligibleCount} eligible</dd>
                </div>
              )}
              {(channel === "WHATSAPP" || channel === "BOTH") && (
                <div className="flex justify-between">
                  <dt className="text-brown-light">WhatsApp</dt>
                  <dd className="text-brown-dark text-right">
                    {selectedTemplate?.name} — {preview.whatsappEligibleCount} eligible, {preview.totalCount - preview.whatsappEligibleCount} skipped
                  </dd>
                </div>
              )}
            </dl>
            {isLargeSend && (
              <label className="flex items-start gap-2 text-sm bg-amber-500/10 rounded-[8px] px-4 py-3 mb-4">
                <input type="checkbox" checked={largeSendAck} onChange={(e) => setLargeSendAck(e.target.checked)} className="mt-0.5" />
                You are about to contact {preview.totalCount} vendors. I understand this cannot be undone.
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)} disabled={sending}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSend} loading={sending} disabled={isLargeSend && !largeSendAck}>
                Send to {preview.totalCount} Vendor{preview.totalCount === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
