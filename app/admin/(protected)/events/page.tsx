import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Events — Admin" };

export default async function AdminEventsPage() {
  const events = await prisma.event.findMany({
    include: { booths: true, applications: true },
    orderBy: { startDate: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl text-brown-dark">Events</h1>
        <Link href="/admin/events/new" className="px-4 py-2 rounded-full bg-brown text-cream-soft text-sm">
          New event
        </Link>
      </div>

      <div className="space-y-3">
        {events.map((e) => {
          const sold = e.booths.filter((b) => b.status === "SOLD").length;
          return (
            <Link
              key={e.id}
              href={`/admin/events/${e.id}`}
              className="flex items-center justify-between rounded-xl border border-brown/10 bg-cream-soft px-5 py-4 hover:bg-cream flex-wrap gap-2"
            >
              <div>
                <p className="font-heading text-brown-dark">{e.name}</p>
                <p className="text-xs text-brown-light">
                  {e.startDate.toLocaleDateString()} · {e.location}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-brown-light">
                <span className="px-2.5 py-1 rounded-full bg-cream-deep">{e.status}</span>
                <span>{sold}/{e.booths.length} booths sold</span>
                <span>{e.applications.length} applications</span>
              </div>
            </Link>
          );
        })}
        {events.length === 0 && <p className="text-brown-light text-sm">No events yet.</p>}
      </div>
    </div>
  );
}
