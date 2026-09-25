import { redirect, notFound } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { getApplicationView } from "@/lib/applicationView";
import { getPublishedAgreement } from "@/lib/agreements";
import { formatBoothCodes, splitVatInclusiveTotal } from "@/lib/constants";
import { onlinePaymentMode } from "@/lib/paymentMode";
import { EventTermsClient } from "./EventTermsClient";

export default async function EventTermsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const { id } = await params;
  const view = await getApplicationView(id, session.vendorId);
  if (!view) notFound();

  // Nothing to review if there's no published agreement for this event, or
  // if this vendor already accepted the current version.
  if (!view.eventTermsRequired || view.eventTermsAccepted) {
    redirect(`/vendor/applications/${id}`);
  }

  const agreement = await getPublishedAgreement("EVENT_TERMS", view.event.id);
  if (!agreement) redirect(`/vendor/applications/${id}`);

  // A persistent booking summary (per requirement: Event Terms shows a
  // summary alongside the map access, not just a bare booth code) — priced
  // server-side from the same getBoothPrice call already baked into
  // view.boothHolds, never re-derived client-side.
  const boothLines = view.boothHolds.map((b) => {
    if (b.priceAedFils == null) return { code: b.code, priceAedFils: null, baseAedFils: null, vatAedFils: null };
    const { baseAedFils, vatAedFils } = splitVatInclusiveTotal(b.priceAedFils);
    return { code: b.code, priceAedFils: b.priceAedFils, baseAedFils, vatAedFils };
  });
  const bookingSummary = {
    lines: boothLines,
    subtotalAedFils: boothLines.reduce((s, l) => s + (l.baseAedFils ?? 0), 0),
    vatAedFils: boothLines.reduce((s, l) => s + (l.vatAedFils ?? 0), 0),
    totalAedFils: boothLines.reduce((s, l) => s + (l.priceAedFils ?? 0), 0),
  };

  return (
    <EventTermsClient
      applicationId={id}
      eventId={view.event.id}
      eventName={view.event.name}
      eventDate={view.event.startDate}
      venue={view.event.location}
      businessName={view.businessName}
      boothCode={view.boothHolds.length ? formatBoothCodes(view.boothHolds.map((b) => b.code)) : null}
      bookingSummary={bookingSummary}
      title={agreement.title}
      version={agreement.version}
      bodyHtml={agreement.bodyHtml}
      onlinePaymentAvailable={onlinePaymentMode() !== "DISABLED"}
    />
  );
}
