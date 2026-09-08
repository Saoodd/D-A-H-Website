import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventBySlugPublic, getMinPriceForEvent } from "@/lib/events";
import { getVendorSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisplayStatus } from "@/lib/status";
import { EventDetailClient } from "./EventDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlugPublic(slug);
  if (!event) return {};
  return {
    title: event.name,
    description: event.description || `${event.name} — a Dar Al Hay event in ${event.location}.`,
    openGraph: {
      title: event.name,
      description: event.description,
      images: event.coverImage ? [{ url: event.coverImage }] : undefined,
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlugPublic(slug);
  if (!event) notFound();

  const minPrice = event.showPublicPricing ? await getMinPriceForEvent(event.id) : null;

  // Resolve the vendor's relationship to THIS event server-side, so the
  // client never has to guess or blindly send everyone to /vendors.
  let vendorState: {
    authState: "logged_out" | "unverified" | "verified";
    application: { id: string; displayStatus: string } | null;
  } = { authState: "logged_out", application: null };

  const session = await getVendorSession();
  if (session) {
    const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
    if (vendor) {
      const application = await prisma.application.findFirst({
        where: { vendorId: vendor.id, eventId: event.id },
        include: { payments: { where: { status: "SUCCEEDED" } } },
      });
      vendorState = {
        authState: vendor.verified ? "verified" : "unverified",
        application: application
          ? { id: application.id, displayStatus: getDisplayStatus(application, application.payments.length > 0) }
          : null,
      };
    }
  }

  return (
    <EventDetailClient
      event={{
        slug: event.slug,
        name: event.name,
        description: event.description,
        location: event.location,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate ? event.endDate.toISOString() : null,
        coverImage: event.coverImage,
        categories: event.categories,
        minPriceAedFils: minPrice,
        id: event.id,
      }}
      vendorState={vendorState}
    />
  );
}
