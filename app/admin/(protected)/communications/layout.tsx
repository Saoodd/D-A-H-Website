import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/Card";
import { CommunicationsTabs } from "./CommunicationsTabs";

export const metadata: Metadata = { title: "Communications — Admin" };

export default function CommunicationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Communications"
        description="Send Email and WhatsApp messages to vendors based on real event, application, booking, and payment data — additional to (never a replacement for) automatic notifications."
      />
      <CommunicationsTabs />
      {children}
    </div>
  );
}
