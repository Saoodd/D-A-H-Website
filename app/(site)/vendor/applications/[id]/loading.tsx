import { Skeleton, SkeletonFloorPlan } from "@/components/ui/Skeleton";

export default function ApplicationDetailLoading() {
  return (
    <div className="container-page py-16 max-w-3xl">
      <Skeleton className="h-3.5 w-24 mb-4" />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-3.5 w-56 mt-3 mb-10" />
      <SkeletonFloorPlan />
    </div>
  );
}
