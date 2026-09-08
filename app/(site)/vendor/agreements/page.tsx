import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VendorNav } from "@/components/vendor/VendorNav";
import { EmptyState } from "@/components/ui/Card";
import { EventAgreementsAccordion, type EventAgreementGroup } from "@/components/vendor/EventAgreementsAccordion";

export const metadata: Metadata = { title: "Agreements & Documents — My Profile" };

export default async function VendorAgreementsPage() {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
  if (!vendor) redirect("/vendor/login");

  const acceptances = await prisma.agreementAcceptance.findMany({
    where: { vendorId: vendor.id },
    orderBy: { acceptedAt: "desc" },
  });

  const accountAgreements = acceptances.filter((a) => a.snapshotType === "VENDOR_TERMS");
  const eventAgreements = acceptances.filter((a) => a.snapshotType === "EVENT_TERMS");

  // Every event carries its own independent Terms & Conditions, so the
  // natural way to browse them back is one group per event — resolve the
  // real event (name, start date) behind each acceptance's applicationId
  // rather than trusting the point-in-time snapshot name alone.
  const applicationIds = Array.from(new Set(eventAgreements.map((a) => a.applicationId).filter((id): id is string => !!id)));
  const applications = applicationIds.length
    ? await prisma.application.findMany({
        where: { id: { in: applicationIds } },
        select: { id: true, event: { select: { id: true, name: true, startDate: true } } },
      })
    : [];
  const eventByApplicationId = new Map(applications.map((a) => [a.id, a.event]));

  const groupsMap = new Map<string, EventAgreementGroup>();
  for (const a of eventAgreements) {
    const event = a.applicationId ? eventByApplicationId.get(a.applicationId) : null;
    const key = event?.id ?? a.snapshotEventName ?? a.id;
    const existing = groupsMap.get(key);
    const item = { id: a.id, title: a.snapshotTitle, version: a.snapshotVersion, acceptedAt: a.acceptedAt.toISOString(), representativeName: a.representativeName };
    if (existing) {
      existing.agreements.push(item);
    } else {
      groupsMap.set(key, {
        eventId: key,
        eventName: event?.name ?? a.snapshotEventName ?? "Event",
        eventDate: event?.startDate ? event.startDate.toISOString() : null,
        agreements: [item],
      });
    }
  }
  const eventGroups = Array.from(groupsMap.values()).sort(
    (a, b) => new Date(b.agreements[0].acceptedAt).getTime() - new Date(a.agreements[0].acceptedAt).getTime()
  );

  return (
    <div className="container-page py-12">
      <div className="flex flex-col md:flex-row gap-8">
        <VendorNav businessName={vendor.businessName} />

        <div className="flex-1 min-w-0 max-w-2xl">
          <h1 className="font-heading text-2xl text-brown-dark mb-1">Agreements & Documents</h1>
          <p className="text-sm text-brown-light mb-8">
            Every Terms &amp; Conditions you&rsquo;ve accepted with Dar Al Hay — your account agreement and every event
            you&rsquo;ve booked into — stays available here permanently.
          </p>

          <section className="mb-10">
            <p className="label-caps mb-1">Account Agreements</p>
            <p className="text-xs text-brown-light mb-3">Accepted once, when you created your DAH business account.</p>
            {accountAgreements.length === 0 ? (
              <EmptyState title="Nothing accepted yet" />
            ) : (
              <div className="space-y-2">
                {accountAgreements.map((a) => (
                  <AgreementRow key={a.id} id={a.id} title={a.snapshotTitle} version={a.snapshotVersion} acceptedAt={a.acceptedAt.toISOString()} />
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="label-caps mb-1">Event Agreements</p>
            <p className="text-xs text-brown-light mb-3">A separate agreement for every event you&rsquo;ve applied to — grouped below by event.</p>
            {eventGroups.length === 0 ? (
              <EmptyState title="No event agreements yet" />
            ) : (
              <EventAgreementsAccordion groups={eventGroups} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function AgreementRow({ id, title, version, acceptedAt }: { id: string; title: string; version: number; acceptedAt: string }) {
  return (
    <Link
      href={`/vendor/agreements/${id}`}
      className="flex items-center justify-between gap-3 rounded-[10px] border border-brown/10 bg-cream hover:border-brown/25 px-4 py-3 transition-colors"
    >
      <div>
        <p className="text-sm font-medium text-brown-dark">{title}</p>
        <p className="text-xs text-brown-light mt-0.5">
          v{version} · Accepted {new Date(acceptedAt).toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>
      <span className="text-xs text-brown underline shrink-0">View</span>
    </Link>
  );
}
