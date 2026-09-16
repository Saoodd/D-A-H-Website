"use client";

import { useEffect, useState } from "react";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface TemplateButton {
  type: string;
  text: string | null;
  url: string | null;
  hasPlaceholder: boolean;
}
interface Template {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  bodyText: string | null;
  headerText: string | null;
  footerText: string | null;
  buttonsJson: string | null;
  variableCount: number;
  source: string;
  syncedAt: string;
}

function parseButtons(json: string | null): TemplateButton[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function TemplatesClient() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [mName, setMName] = useState("");
  const [mLanguage, setMLanguage] = useState("en");
  const [mBody, setMBody] = useState("");
  const [mCategory, setMCategory] = useState("MARKETING");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/whatsapp-templates");
      const data = await res.json();
      setConfigured(data.configured !== false);
      setError(data.error || null);
      setTemplates(data.templates || []);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the live template list on mount, not derived render state
    load();
  }, []);

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    setManualBusy(true);
    try {
      const res = await fetch("/api/admin/whatsapp-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: mName, language: mLanguage, bodyText: mBody, category: mCategory }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't register that template.");
        return;
      }
      setMName("");
      setMBody("");
      setManualOpen(false);
      load();
    } finally {
      setManualBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-lg text-brown-dark">Approved WhatsApp templates</p>
            <p className="text-sm text-brown-light mt-1">
              Live-synced from Infobip — never hardcoded. Authentication/OTP templates are automatically excluded from this
              picker.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={load} loading={loading}>
            Refresh from Infobip
          </Button>
        </div>
        {!configured && (
          <p className="mt-4 text-sm text-amber-800 bg-amber-500/10 rounded-[8px] px-4 py-3">
            {error || "WhatsApp isn&apos;t configured yet."} Set <code className="text-xs">INFOBIP_WHATSAPP_BASE_URL</code>,{" "}
            <code className="text-xs">INFOBIP_WHATSAPP_API_KEY</code>, and <code className="text-xs">INFOBIP_WHATSAPP_SENDER</code> to
            sync real templates — until then, register one manually below if you already know a real approved template&apos;s details.
          </p>
        )}
        {configured && error && (
          <p className="mt-4 text-sm text-amber-800 bg-amber-500/10 rounded-[8px] px-4 py-3">{error}</p>
        )}
      </Card>

      {templates === null ? (
        <p className="text-sm text-brown-light">Loading…</p>
      ) : templates.length === 0 ? (
        <EmptyState title="No templates yet" description="Sync from Infobip or register one manually below." />
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const isOpen = expanded === t.id;
            const buttons = parseButtons(t.buttonsJson);
            return (
              <Card key={t.id} className="p-4">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                  className="w-full flex flex-wrap items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-brown-light">{isOpen ? "▾" : "▸"}</span>
                    <p className="font-medium text-brown-dark">{t.name}</p>
                    <span className="text-xs text-brown-light">{t.language}</span>
                    {t.category && (
                      <StatusBadge label={t.category} tone={t.category.toUpperCase() === "MARKETING" ? "attention" : "neutral"} />
                    )}
                    <StatusBadge
                      label={t.source === "SYNCED" ? t.status || "Synced" : "Manually registered — unverified"}
                      tone={t.source === "SYNCED" && (t.status || "").toUpperCase() === "APPROVED" ? "positive" : "attention"}
                    />
                  </div>
                  <span className="text-xs text-brown-light">{t.variableCount} variable{t.variableCount === 1 ? "" : "s"}</span>
                </button>

                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-brown/10 space-y-3">
                    {t.headerText && (
                      <div>
                        <p className="label-caps text-xs">Header</p>
                        <p className="mt-1 text-sm text-brown-dark bg-cream-deep/30 rounded-[6px] px-3 py-2 whitespace-pre-wrap">{t.headerText}</p>
                      </div>
                    )}
                    <div>
                      <p className="label-caps text-xs">Body</p>
                      <p className="mt-1 text-sm text-brown-dark bg-cream-deep/30 rounded-[6px] px-3 py-2 whitespace-pre-wrap">{t.bodyText || "—"}</p>
                    </div>
                    {t.variableCount > 0 && (
                      <div>
                        <p className="label-caps text-xs">Variables</p>
                        <p className="mt-1 text-sm text-brown-dark font-mono">
                          {Array.from({ length: t.variableCount }, (_, i) => `{{${i + 1}}}`).join("  ")}
                        </p>
                      </div>
                    )}
                    {t.footerText && (
                      <div>
                        <p className="label-caps text-xs">Footer</p>
                        <p className="mt-1 text-sm text-brown-dark bg-cream-deep/30 rounded-[6px] px-3 py-2 whitespace-pre-wrap">{t.footerText}</p>
                      </div>
                    )}
                    {buttons.length > 0 && (
                      <div>
                        <p className="label-caps text-xs">Button{buttons.length === 1 ? "" : "s"}</p>
                        <div className="mt-1 space-y-1">
                          {buttons.map((b, i) => (
                            <p key={i} className="text-sm text-brown-dark">
                              {b.text || b.type} {b.hasPlaceholder && <span className="text-xs text-brown-light">— dynamic URL parameter</span>}
                              {b.url && <span className="text-xs text-brown-light"> ({b.url})</span>}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-5">
        <button type="button" onClick={() => setManualOpen((v) => !v)} className="text-sm font-medium text-brown-dark">
          {manualOpen ? "− " : "+ "}Register a template manually
        </button>
        {manualOpen && (
          <form onSubmit={submitManual} className="mt-4 space-y-3 max-w-lg">
            <p className="text-xs text-brown-light">
              Use this only if you already know a template that&apos;s genuinely approved in your Infobip/Meta account — this app
              cannot verify that for you, and the template will always show as &quot;unverified&quot; rather than
              &quot;Approved&quot; until a live sync confirms it.
            </p>
            <div>
              <label className="text-xs font-medium text-brown-dark">Template name</label>
              <input value={mName} onChange={(e) => setMName(e.target.value)} required className="mt-1 w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-brown-dark">Language code</label>
                <input value={mLanguage} onChange={(e) => setMLanguage(e.target.value)} required placeholder="en" className="mt-1 w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-brown-dark">Category</label>
                <select value={mCategory} onChange={(e) => setMCategory(e.target.value)} className="mt-1 w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm">
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-brown-dark">Body text (use {"{{1}}"}, {"{{2}}"}… for variables)</label>
              <textarea value={mBody} onChange={(e) => setMBody(e.target.value)} required rows={3} className="mt-1 w-full rounded-[6px] border border-brown/20 px-3 py-2 text-sm" />
            </div>
            <Button type="submit" size="sm" loading={manualBusy}>
              Register template
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
