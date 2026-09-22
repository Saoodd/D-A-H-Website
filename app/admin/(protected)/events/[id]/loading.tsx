import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

// EventWorkspaceClient's tabs (Overview/Applications/Floor Plan & Booths/
// Vendors/Payments/Terms/Settings) are client-side state, not routes — all
// workspace data is fetched once server-side before the client component
// even mounts, so this is the only loading gap for the whole workspace.
// Mirrors the tab bar shape so it doesn't visually jump once real tabs
// render.
export default function EventWorkspaceLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-3.5 w-20 mb-3" />
        <Skeleton className="h-8 w-72" />
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-brown/10 pb-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 shrink-0 mb-2 rounded-[6px]" />
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
