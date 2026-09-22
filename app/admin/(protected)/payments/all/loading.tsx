import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

export default function AdminPaymentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-9 w-72 rounded-[6px]" />
      </div>
      <SkeletonTable rows={10} />
    </div>
  );
}
