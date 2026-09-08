import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VendorNav } from "@/components/vendor/VendorNav";
import { EmptyState } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Agreements & Documents — My DAH" };

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
            <p className="label-caps mb-3">Account Agreements</p>
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
            <p className="label-caps mb-3">Event Agreements</p>
            {eventAgreements.length === 0 ? (
              <EmptyState title="No event agreements yet" />
            ) : (
              <div className="space-y-2">
                {eventAgreements.map((a) => (
                  <AgreementRow
                    key={a.id}
                    id={a.id}
                    title={a.snapshotEventName ? `${a.snapshotTitle} — ${a.snapshotEventName}` : a.snapshotTitle}
                    version={a.snapshotVersion}
                    acceptedAt={a.acceptedAt.toISOString()}
                  />
                ))}
              </div>
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
