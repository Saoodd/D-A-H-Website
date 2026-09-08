import { redirect, notFound } from "next/navigation";
import { getVendorSession } from "@/lib/auth";
import { getApplicationView } from "@/lib/applicationView";
import { getPublishedAgreement } from "@/lib/agreements";
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

  return (
    <EventTermsClient
      applicationId={id}
      eventName={view.event.name}
      title={agreement.title}
      version={agreement.version}
      bodyHtml={agreement.bodyHtml}
    />
  );
}
