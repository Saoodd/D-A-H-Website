// Shared loading-placeholder primitives — used by route-level loading.tsx
// files and by components that fetch client-side with no server-supplied
// data yet, so nothing shows a blank/white gap while waiting. Built on
// Tailwind's animate-pulse utility (reduced-motion guard lives once,
// globally, in app/globals.css rather than repeated per-component).

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-[6px] bg-brown/10 ${className}`} />;
}

export function SkeletonText({ lines = 1, className = "" }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-3.5 animate-pulse rounded bg-brown/10 ${i === lines - 1 && lines > 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`shrink-0 animate-pulse rounded-full bg-brown/10 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** A generic bordered content card — matches the rounded-[10px] border
 *  border-brown/10 bg-cream card shape used throughout the vendor/admin
 *  UI (dashboard summaries, application cards, profile summary). */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-[10px] border border-brown/10 bg-cream p-5 sm:p-6 ${className}`}>
      <Skeleton className="mb-3 h-3.5 w-1/3" />
      <Skeleton className="mb-2 h-6 w-2/3" />
      <Skeleton className="h-3.5 w-1/2" />
    </div>
  );
}

/** Same shape as SkeletonCard, sized to read as an upcoming-event card
 *  (cover-image band + title + date/location lines). */
export function SkeletonEventCard({ className = "" }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[10px] border border-brown/10 bg-cream ${className}`}>
      <div aria-hidden="true" className="aspect-[16/9] w-full animate-pulse bg-brown/10" />
      <div className="p-5">
        <Skeleton className="mb-2 h-3 w-1/3" />
        <Skeleton className="mb-3 h-5 w-4/5" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </div>
  );
}

/** Matches FloorPlan's own container exactly (relative w-full aspect-square
 *  max-h-[70vh] overflow-hidden — see components/floorplan/FloorPlan.tsx)
 *  so swapping this out for the real map never causes a layout jump. */
export function SkeletonFloorPlan({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-full aspect-square max-h-[70vh] overflow-hidden rounded-[10px] border border-brown/10 bg-cream ${className}`}>
      <div aria-hidden="true" className="h-full w-full animate-pulse bg-gradient-to-br from-brown/5 via-brown/10 to-brown/5" />
    </div>
  );
}

/** One table/list row — a handful of inline fields of varying width. */
export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 py-3.5 ${className}`}>
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-4 w-1/6" />
      <Skeleton className="h-4 w-1/6" />
      <Skeleton className="h-4 w-1/5" />
    </div>
  );
}

/** A bordered list of SkeletonRow — matches the admin table card shape
 *  (vendors, payments, applications). */
export function SkeletonTable({ rows = 6, className = "" }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`divide-y divide-brown/10 rounded-[10px] border border-brown/10 bg-cream ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} className="px-4" />
      ))}
    </div>
  );
}
