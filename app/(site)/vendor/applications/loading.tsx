import { VendorNav } from "@/components/vendor/VendorNav";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";

export default function ApplicationsListLoading() {
  return (
    <div className="container-page py-12">
      <div className="flex flex-col md:flex-row gap-8">
        <VendorNav />
        <div className="flex-1 min-w-0 space-y-5">
          <Skeleton className="h-6 w-48" />
          <div className="rounded-[10px] border border-brown/10 bg-cream divide-y divide-brown/10 px-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
