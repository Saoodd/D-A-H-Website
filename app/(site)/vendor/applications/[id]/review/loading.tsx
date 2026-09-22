import { Skeleton, SkeletonFloorPlan } from "@/components/ui/Skeleton";

export default function BookingReviewLoading() {
  return (
    <div className="container-page py-14 md:py-16 max-w-3xl space-y-8">
      <div>
        <Skeleton className="h-3.5 w-24 mb-4" />
        <Skeleton className="h-8 w-2/3 mb-2" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>

      <div className="rounded-[10px] border border-brown/10 bg-cream p-5 sm:p-6 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      <SkeletonFloorPlan />

      <div className="flex gap-3">
        <Skeleton className="h-11 w-40 rounded-full" />
        <Skeleton className="h-11 w-44 rounded-full" />
      </div>
    </div>
  );
}
