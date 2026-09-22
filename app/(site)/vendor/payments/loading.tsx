import { VendorNav } from "@/components/vendor/VendorNav";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

export default function PaymentsLoading() {
  return (
    <div className="container-page py-12">
      <div className="flex flex-col md:flex-row gap-8">
        <VendorNav />
        <div className="flex-1 min-w-0 space-y-5">
          <Skeleton className="h-6 w-32" />
          <SkeletonTable rows={5} />
        </div>
      </div>
    </div>
  );
}
