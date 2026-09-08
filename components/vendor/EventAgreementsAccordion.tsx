"use client";

import { useState } from "react";
import Link from "next/link";

export interface EventAgreementItem {
  id: string;
  title: string;
  version: number;
  acceptedAt: string;
  representativeName: string | null;
}

export interface EventAgreementGroup {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  agreements: EventAgreementItem[];
}

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" });

/** Every event's agreements grouped into its own expandable record — a
 *  vendor accepts a separate Terms & Conditions per event, never one
 *  shared template, so this is the natural shape for browsing them back:
 *  one folder per event, opened to reveal what was signed and when. */
export function EventAgreementsAccordion({ groups }: { groups: EventAgreementGroup[] }) {
  const [openId, setOpenId] = useState<string | null>(groups[0]?.eventId ?? null);

  return (
    <div className="space-y-2.5">
      {groups.map((g) => {
        const isOpen = openId === g.eventId;
        return (
          <div key={g.eventId} className="rounded-[10px] border border-brown/10 bg-cream overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : g.eventId)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-brown/5 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-brown-light shrink-0"
                  aria-hidden="true"
                >
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brown-dark truncate">{g.eventName}</p>
                  <p className="text-xs text-brown-light mt-0.5">
                    {g.agreements.length} agreement{g.agreements.length === 1 ? "" : "s"}
                    {g.eventDate ? ` · ${dateFmt(g.eventDate)}` : ""}
                  </p>
                </div>
              </div>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-brown-light shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div className="border-t border-brown/10 divide-y divide-brown/10">
                  {g.agreements.map((a) => (
                    <Link
                      key={a.id}
                      href={`/vendor/agreements/${a.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brown/5 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-brown-dark truncate">{a.title}</p>
                        <p className="text-xs text-brown-light mt-0.5">
                          v{a.version} · Accepted {dateFmt(a.acceptedAt)}
                          {a.representativeName ? ` · ${a.representativeName}` : ""}
                        </p>
                      </div>
                      <span className="text-xs text-brown underline shrink-0">View</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
