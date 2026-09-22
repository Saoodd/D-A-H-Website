import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

// AdminSidebar/chrome comes from app/admin/(protected)/layout.tsx and
// keeps rendering as-is — this only replaces the content area while the
// vendor list (Prisma query, request-time) resolves.
export default function AdminVendorsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-64 rounded-[6px]" />
      </div>
      <SkeletonTable rows={10} />
    </div>
  );
}
