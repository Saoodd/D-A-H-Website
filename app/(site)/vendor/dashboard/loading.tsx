import { VendorNav } from "@/components/vendor/VendorNav";
import { Skeleton, SkeletonCard, SkeletonAvatar } from "@/components/ui/Skeleton";

// Shown automatically by Next.js while DashboardClient's server data
// (confirmed/upcoming events, applications, profile summary) is still
// loading — same page shell (nav) as the real page, so nothing blanks.
export default function DashboardLoading() {
  return (
    <div className="container-page py-12 md:py-16">
      <div className="flex flex-col md:flex-row gap-8">
        <VendorNav />
        <div className="flex-1 min-w-0 space-y-8">
          <div className="flex items-center gap-3">
            <SkeletonAvatar size={48} />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          </div>
          <div>
            <Skeleton className="h-4 w-36 mb-4" />
            <div className="grid sm:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
          <div>
            <Skeleton className="h-4 w-44 mb-4" />
            <div className="grid sm:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
