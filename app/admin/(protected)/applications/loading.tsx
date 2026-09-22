import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

export default function AdminApplicationsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-56" />
      <SkeletonTable rows={8} />
    </div>
  );
}
