import { redirect, notFound } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { getApplicationView } from "@/lib/applicationView";
import { splitVatInclusiveTotal } from "@/lib/constants";
import { onlinePaymentMode } from "@/lib/paymentMode";
import { BookingReviewClient } from "./BookingReviewClient";

export default async function BookingReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const { id } = await params;
  const view = await getApplicationView(id, session.vendorId);
  if (!view) notFound();

  // Nothing to review once a booking has moved past the REVIEW hold stage
  // (no hold yet, already at payment, or already paid) — send back to the
  // main application page, which knows how to render every other stage.
  if (view.boothHolds.length === 0 || view.boothHolds[0].holdStage !== "REVIEW") {
    redirect(`/vendor/applications/${id}`);
  }

  // Same server-priced summary the Terms page shows, computed once here so
  // both pre-Terms surfaces agree on the exact same numbers.
  const boothLines = view.boothHolds.map((b) => {
    if (b.priceAedFils == null) return { code: b.code, priceAedFils: null, baseAedFils: null, vatAedFils: null, widthMm: b.widthMm, depthMm: b.depthMm, size: b.size };
    const { baseAedFils, vatAedFils } = splitVatInclusiveTotal(b.priceAedFils);
    return { code: b.code, priceAedFils: b.priceAedFils, baseAedFils, vatAedFils, widthMm: b.widthMm, depthMm: b.depthMm, size: b.size };
  });
  const bookingSummary = {
    lines: boothLines,
    subtotalAedFils: boothLines.reduce((s, l) => s + (l.baseAedFils ?? 0), 0),
    vatAedFils: boothLines.reduce((s, l) => s + (l.vatAedFils ?? 0), 0),
    totalAedFils: boothLines.reduce((s, l) => s + (l.priceAedFils ?? 0), 0),
  };

  return (
    <BookingReviewClient
      applicationId={id}
      eventId={view.event.id}
      eventName={view.event.name}
      eventDate={view.event.startDate}
      venue={view.event.location}
      businessName={view.businessName}
      acceptanceExpiresAt={view.acceptanceExpiresAt}
      setupWidthMm={view.setupWidthMm}
      setupDepthMm={view.setupDepthMm}
      eventTermsRequired={view.eventTermsRequired}
      eventTermsAccepted={view.eventTermsAccepted}
      bookingSummary={bookingSummary}
      onlinePaymentAvailable={onlinePaymentMode() !== "DISABLED"}
    />
  );
}
