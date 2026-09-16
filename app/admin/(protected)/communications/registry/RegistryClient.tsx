"use client";

import { useEffect, useState } from "react";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EMAIL_VARIABLES, VARIABLE_LABEL } from "@/lib/communications/variables";

type VarMapping = Record<string, { kind: "field"; field: string } | { kind: "literal"; value: string }>;

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
}

interface UseCaseMapped {
  templateName: string;
  templateLanguage: string;
  enabled: boolean;
  placeholderMapping: VarMapping;
  buttonMapping: VarMapping;
  updatedByName: string | null;
  updatedAt: string;
}

interface UseCaseRow {
  useCase: string;
  label: string;
  mapped: UseCaseMapped | null;
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

export function RegistryClient() {
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [useCases, setUseCases] = useState<UseCaseRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editor state, only meaningful while `editing` is set
  const [selectedKey, setSelectedKey] = useState("");
  const [placeholderMapping, setPlaceholderMapping] = useState<VarMapping>({});
  const [buttonMapping, setButtonMapping] = useState<VarMapping>({});
  const [enabled, setEnabled] = useState(true);
  const [updatedByName, setUpdatedByName] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notification-templates");
      const data = await res.json();
      setConfigured(data.configured !== false);
      setError(data.error || null);
      setTemplates(data.templates || []);
      setUseCases(data.useCases || []);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the live template list + mappings on mount
    load();
  }, []);

  function startEdit(row: UseCaseRow) {
    setEditing(row.useCase);
    if (row.mapped) {
      setSelectedKey(`${row.mapped.templateName}::${row.mapped.templateLanguage}`);
      setPlaceholderMapping(row.mapped.placeholderMapping || {});
      setButtonMapping(row.mapped.buttonMapping || {});
      setEnabled(row.mapped.enabled);
      setUpdatedByName(row.mapped.updatedByName || "");
    } else {
      setSelectedKey("");
      setPlaceholderMapping({});
      setButtonMapping({});
      setEnabled(true);
      setUpdatedByName("");
    }
  }

  const selectedTemplate = templates.find((t) => `${t.name}::${t.language}` === selectedKey) || null;
  const selectedButtons = selectedTemplate ? parseButtons(selectedTemplate.buttonsJson) : [];

  async function save(useCase: string) {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/notification-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useCase,
          templateName: selectedTemplate.name,
          templateLanguage: selectedTemplate.language,
          placeholderMapping,
          buttonMapping,
          enabled,
          updatedByName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save that mapping.");
        return;
      }
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function clearMapping(useCase: string) {
    setSaving(true);
    try {
      await fetch(`/api/admin/notification-templates?useCase=${encodeURIComponent(useCase)}`, { method: "DELETE" });
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-lg text-brown-dark">Template Registry</p>
            <p className="text-sm text-brown-light mt-1">
              Map each DAH notification use case to one of your account&apos;s real approved WhatsApp Utility templates —
              live-synced from Infobip below, never guessed or hardcoded. The Authentication template used for phone
              verification is never shown here.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={load} loading={loading}>
            Refresh from Infobip
          </Button>
        </div>
        {!configured && (
          <p className="mt-4 text-sm text-amber-800 bg-amber-500/10 rounded-[8px] px-4 py-3">
            {error || "WhatsApp isn't configured yet."} Set the INFOBIP_WHATSAPP_* variables to sync real templates.
          </p>
        )}
        {configured && error && <p className="mt-4 text-sm text-amber-800 bg-amber-500/10 rounded-[8px] px-4 py-3">{error}</p>}
      </Card>

      {templates.length === 0 && !loading ? (
        <EmptyState
          title="No Utility templates synced yet"
          description="Register a template manually on the Templates tab, or check your Infobip account has approved Utility templates for this sender."
        />
      ) : (
        <div className="space-y-3">
          {useCases.map((row) => {
            const isOpen = editing === row.useCase;
            const mappedTemplate = row.mapped
              ? templates.find((t) => t.name === row.mapped!.templateName && t.language === row.mapped!.templateLanguage)
              : null;
            return (
              <Card key={row.useCase} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-brown-dark">{row.label}</p>
                    <p className="text-xs text-brown-light mt-0.5">{row.useCase}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.mapped ? (
                      <>
                        <StatusBadge
                          label={`${row.mapped.templateName} (${row.mapped.templateLanguage})`}
                          tone={mappedTemplate && (mappedTemplate.status || "").toUpperCase() === "APPROVED" ? "positive" : "attention"}
                        />
                        {!row.mapped.enabled && <StatusBadge label="Disabled" tone="attention" />}
                      </>
                    ) : (
                      <StatusBadge label="Not configured" tone="attention" />
                    )}
                    <Button variant="secondary" size="sm" onClick={() => (isOpen ? setEditing(null) : startEdit(row))}>
                      {isOpen ? "Close" : row.mapped ? "Edit" : "Configure"}
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-brown/10 space-y-3">
                    <select
                      value={selectedKey}
                      onChange={(e) => {
                        setSelectedKey(e.target.value);
                        setPlaceholderMapping({});
                        setButtonMapping({});
                      }}
                      className="w-full sm:w-96 rounded-[6px] border border-brown/20 px-3 py-2 text-sm"
                    >
                      <option value="">Select a real template…</option>
                      {templates.map((t) => (
                        <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                          {t.name} ({t.language}) — {t.status || "unknown status"}
                        </option>
                      ))}
                    </select>

                    {selectedTemplate && (
                      <div className="space-y-3">
                        {selectedTemplate.headerText && (
                          <p className="text-xs text-brown-light bg-cream-deep/30 rounded-[6px] px-3 py-2">
                            <span className="font-medium">Header:</span> {selectedTemplate.headerText}
                          </p>
                        )}
                        {selectedTemplate.bodyText && (
                          <p className="text-sm bg-cream-deep/30 rounded-[6px] px-3 py-2 whitespace-pre-wrap">{selectedTemplate.bodyText}</p>
                        )}
                        {selectedTemplate.footerText && (
                          <p className="text-xs text-brown-light bg-cream-deep/30 rounded-[6px] px-3 py-2">
                            <span className="font-medium">Footer:</span> {selectedTemplate.footerText}
                          </p>
                        )}

                        {Array.from({ length: selectedTemplate.variableCount }, (_, i) => i + 1).map((idx) => {
                          const current = placeholderMapping[String(idx)];
                          return (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="text-xs text-brown-light w-10">{`{{${idx}}}`}</span>
                              <select
                                value={current?.kind === "field" ? current.field : current?.kind === "literal" ? "__literal__" : ""}
                                onChange={(e) =>
                                  setPlaceholderMapping((prev) => ({
                                    ...prev,
                                    [String(idx)]: e.target.value === "__literal__" ? { kind: "literal", value: "" } : { kind: "field", field: e.target.value },
                                  }))
                                }
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
                                <input
                                  value={current.value}
                                  onChange={(e) => setPlaceholderMapping((prev) => ({ ...prev, [String(idx)]: { kind: "literal", value: e.target.value } }))}
                                  className="flex-1 rounded-[6px] border border-brown/20 px-2 py-1.5 text-sm"
                                  placeholder="Enter text…"
                                />
                              )}
                            </div>
                          );
                        })}

                        {selectedButtons.length > 0 && (
                          <div className="pt-2 border-t border-brown/10 space-y-2">
                            <p className="text-xs font-medium text-brown-dark">Buttons</p>
                            {selectedButtons.map((b, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-xs text-brown-light w-24 truncate">{b.text || b.type}</span>
                                {!b.hasPlaceholder ? (
                                  <span className="text-xs text-brown-light">Static — no mapping needed</span>
                                ) : (
                                  <>
                                    <select
                                      value={buttonMapping[String(idx)]?.kind === "field" ? (buttonMapping[String(idx)] as { field: string }).field : buttonMapping[String(idx)]?.kind === "literal" ? "__literal__" : ""}
                                      onChange={(e) =>
                                        setButtonMapping((prev) => ({
                                          ...prev,
                                          [String(idx)]: e.target.value === "__literal__" ? { kind: "literal", value: "" } : { kind: "field", field: e.target.value },
                                        }))
                                      }
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
                                    {buttonMapping[String(idx)]?.kind === "literal" && (
                                      <input
                                        value={(buttonMapping[String(idx)] as { value: string }).value}
                                        onChange={(e) => setButtonMapping((prev) => ({ ...prev, [String(idx)]: { kind: "literal", value: e.target.value } }))}
                                        className="flex-1 rounded-[6px] border border-brown/20 px-2 py-1.5 text-sm"
                                        placeholder="Enter URL segment…"
                                      />
                                    )}
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <label className="flex items-center gap-2 text-sm text-brown-dark">
                          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                          Enabled — send this notification automatically
                        </label>

                        <div>
                          <label className="text-xs font-medium text-brown-dark">Mapped by (optional)</label>
                          <input
                            value={updatedByName}
                            onChange={(e) => setUpdatedByName(e.target.value)}
                            className="mt-1 w-full sm:w-64 rounded-[6px] border border-brown/20 px-3 py-2 text-sm"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <Button size="sm" onClick={() => save(row.useCase)} loading={saving}>
                            Save mapping
                          </Button>
                          {row.mapped && (
                            <Button variant="secondary" size="sm" onClick={() => clearMapping(row.useCase)} loading={saving}>
                              Clear mapping
                            </Button>
                          )}
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
    </div>
  );
}
