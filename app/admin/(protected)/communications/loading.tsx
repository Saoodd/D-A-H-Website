import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

export default function AdminCommunicationsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <SkeletonTable rows={6} />
    </div>
  );
}
