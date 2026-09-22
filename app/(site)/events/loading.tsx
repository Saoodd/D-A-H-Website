import { Skeleton, SkeletonEventCard } from "@/components/ui/Skeleton";

export default function EventsLoading() {
  return (
    <div className="container-page py-16">
      <Skeleton className="h-8 w-56 mb-3" />
      <Skeleton className="h-4 w-80 mb-10" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonEventCard key={i} />
        ))}
      </div>
    </div>
  );
}
