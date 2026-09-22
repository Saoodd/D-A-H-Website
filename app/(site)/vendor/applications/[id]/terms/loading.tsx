import { Skeleton } from "@/components/ui/Skeleton";

export default function EventTermsLoading() {
  return (
    <div className="container-page py-14 md:py-16 max-w-3xl space-y-6">
      <div>
        <Skeleton className="h-3.5 w-24 mb-4" />
        <Skeleton className="h-8 w-1/2" />
      </div>
      <div className="rounded-2xl border border-brown/15 bg-cream px-6 py-8 md:px-12 md:py-10 space-y-3">
        <Skeleton className="h-4 w-2/3 mx-auto mb-6" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className={`h-3.5 mx-auto ${i % 3 === 2 ? "w-3/4" : "w-full"}`} />
        ))}
      </div>
      <Skeleton className="h-11 w-full rounded-full" />
    </div>
  );
}
