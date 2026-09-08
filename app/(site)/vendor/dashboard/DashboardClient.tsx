"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { Countdown } from "@/components/Countdown";
import { DisplayStatus, formatAed } from "@/lib/constants";
import { VendorNav } from "@/components/vendor/VendorNav";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface AppRow {
  id: string;
  eventName: string;
  eventStartDate: string;
  displayStatus: DisplayStatus;
  acceptanceExpiresAt: string | null;
}

interface AvailableEvent {
  id: string;
  name: string;
  location: string;
  startDate: string;
  categories: string[];
}

interface NextConfirmedEvent {
  eventName: string;
  eventSlug: string;
  startDate: string;
  location: string;
  boothCode: string;
}

interface PaymentRow {
  applicationId: string;
  eventName: string;
  boothCode: string;
  boothSize: string;
  amountAedFils: number;
  paidAt: string | null;
}

const statusTone: Record<DisplayStatus, "neutral" | "positive" | "attention" | "negative"> = {
  PENDING: "neutral",
  REJECTED: "negative",
  ACCEPTED_UNPAID: "attention",
  PAID: "positive",
  EXPIRED: "neutral",
};

type Tab = "overview" | "applications" | "events" | "payments";

export function DashboardClient({
  businessName,
  communityLink,
  applications,
  availableEvents,
  nextConfirmedEvent,
  payments,
  unviewedWarnings,
}: {
  businessName: string;
  communityLink: string | null;
  applications: AppRow[];
  availableEvents: AvailableEvent[];
  nextConfirmedEvent: NextConfirmedEvent | null;
  payments: PaymentRow[];
  unviewedWarnings: { id: string; title: string }[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE");

  const nearDeadline = applications.filter((a) => a.displayStatus === "ACCEPTED_UNPAID" && a.acceptanceExpiresAt);
  const hasActionItems = unviewedWarnings.length > 0 || nearDeadline.length > 0;

  async function applyToEvent(eventId: string) {
    setApplyingId(eventId);
    setNotice(null);
    try {
      const res = await fetch("/api/vendor/apply-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not apply");
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not apply");
    } finally {
      setApplyingId(null);
    }
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: t("vendorOverview.tabOverview") },
    { key: "applications", label: t("vendorOverview.tabApplications"), count: applications.length },
    { key: "events", label: t("vendorOverview.tabEvents"), count: availableEvents.length },
    { key: "payments", label: t("vendorOverview.tabPayments"), count: payments.length },
  ];

  return (
    <div className="container-page py-12 md:py-16">
      <div className="mb-8">
        <h1 className="font-heading text-3xl text-brown-dark">{t("vendor.dashboardTitle")}</h1>
        <p className="text-brown-light text-sm mt-1">
          {t("vendorOverview.welcomeBack")}, {businessName}
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <VendorNav businessName={businessName} />

        <div className="flex-1 min-w-0">
          <div className="flex gap-1 overflow-x-auto mb-8 border-b border-brown/10">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`shrink-0 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                  tab === tb.key ? "border-brown text-brown-dark font-medium" : "border-transparent text-brown-light hover:text-brown-dark"
                }`}
              >
                {tb.label}
                {tb.count != null && tb.count > 0 && <span className="ms-1.5 text-xs text-brown-light">{tb.count}</span>}
              </button>
            ))}
          </div>

          {notice && (
            <div className="mb-6 rounded-[10px] bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
              {notice}
            </div>
          )}

          {tab === "overview" && (
            <div className="space-y-6">
              {hasActionItems && (
                <div className="rounded-[10px] border border-amber-300/60 bg-amber-50 p-5">
                  <p className="label-caps text-amber-900 mb-3">{t("vendorOverview.actionCentreTitle")}</p>
                  <ul className="space-y-2">
                    {unviewedWarnings.map((w) => (
                      <li key={w.id}>
                        <Link href="/vendor/profile" className="text-sm text-amber-900 underline">
                          {t("vendorOverview.actionNewWarning")}
                        </Link>
                      </li>
                    ))}
                    {nearDeadline.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-sm text-amber-900">
                        <span>
                          {t("vendorOverview.actionDeadline")} {a.eventName} —
                        </span>
                        {a.acceptanceExpiresAt && <Countdown target={a.acceptanceExpiresAt} />}
                        <Link href={`/vendor/applications/${a.id}`} className="underline">
                          {t("eventDetail.viewApplicationCta")}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-[10px] border border-brown/10 bg-cream p-6">
                <p className="label-caps mb-1">{t("vendorOverview.nextEventTitle")}</p>
                {nextConfirmedEvent ? (
                  <div className="mt-2">
                    <Link href={`/events/${nextConfirmedEvent.eventSlug}`} className="font-heading text-xl text-brown-dark hover:text-brown">
                      {nextConfirmedEvent.eventName}
                    </Link>
                    <p className="text-sm text-brown-light mt-1">
                      {dateFmt(nextConfirmedEvent.startDate)} · {nextConfirmedEvent.location} ·{" "}
                      {t("vendorPayments.booth")} {nextConfirmedEvent.boothCode}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-brown-light mt-2">{t("vendorOverview.noNextEvent")}</p>
                )}
              </div>

              <div className="rounded-[10px] border border-brown/10 bg-cream p-6 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="label-caps">{t("vendor.communityLink")}</p>
                  <p className="text-sm text-brown-light mt-1">{t("vendorOverview.communityAlways")}</p>
                </div>
                {communityLink ? (
                  <Button size="md" onClick={() => window.open(communityLink, "_blank", "noreferrer")}>
                    {t("vendorOverview.joinWhatsapp")}
                  </Button>
                ) : (
                  <span className="text-sm text-brown-light">{t("vendorOverview.communityNotSet")}</span>
                )}
              </div>
            </div>
          )}

          {tab === "applications" && (
            <div>
              {applications.length === 0 ? (
                <EmptyState title={t("vendorOverview.applicationsEmpty")} />
              ) : (
                <div className="space-y-3">
                  {applications.map((app) => (
                    <Link
                      key={app.id}
                      href={`/vendor/applications/${app.id}`}
                      className="block rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 p-5 transition-colors"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <p className="font-heading text-brown-dark">{app.eventName}</p>
                          <p className="text-xs text-brown-light">{dateFmt(app.eventStartDate)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {app.displayStatus === "ACCEPTED_UNPAID" && app.acceptanceExpiresAt && (
                            <span className="text-xs text-brown-light">
                              {t("vendor.deadlineLabel")} <Countdown target={app.acceptanceExpiresAt} />
                            </span>
                          )}
                          <StatusBadge label={t(`vendor.status.${app.displayStatus}`)} tone={statusTone[app.displayStatus]} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "events" && (
            <div>
              {availableEvents.length === 0 ? (
                <EmptyState title={t("vendorOverview.eventsEmpty")} />
              ) : (
                <div className="space-y-3">
                  {availableEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between flex-wrap gap-3 rounded-[10px] border border-brown/10 bg-cream p-5"
                    >
                      <div>
                        <p className="font-heading text-brown-dark">{ev.name}</p>
                        <p className="text-xs text-brown-light">
                          {dateFmt(ev.startDate)} · {ev.location}
                        </p>
                        {ev.categories.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {ev.categories.map((c) => (
                              <span key={c} className="text-[11px] bg-cream-deep text-brown-dark rounded-full px-2.5 py-0.5">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button size="md" onClick={() => applyToEvent(ev.id)} loading={applyingId === ev.id}>
                        {applyingId === ev.id ? t("vendorOverview.applying") : t("vendorOverview.applyCta")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "payments" && (
            <div>
              {payments.length === 0 ? (
                <EmptyState title={t("vendorOverview.paymentsEmpty")} />
              ) : (
                <div className="space-y-3">
                  {payments.map((p) => (
                    <div key={p.applicationId} className="rounded-[10px] border border-brown/10 bg-cream p-5">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <p className="font-heading text-brown-dark">{p.eventName}</p>
                          <p className="text-xs text-brown-light mt-1">
                            {t("vendorPayments.booth")} {p.boothCode} ({p.boothSize})
                            {p.paidAt ? ` · ${t("vendorPayments.paidOn")} ${dateFmt(p.paidAt)}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-heading text-brown">{formatAed(p.amountAedFils)}</p>
                          <Link href={`/vendor/applications/${p.applicationId}`} className="text-xs underline text-brown-light">
                            {t("vendorPayments.viewApplication")}
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
