import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

// Covers the admin dashboard home (app/admin/(protected)/page.tsx) — the
// nearest loading.tsx up the tree from any admin route that doesn't
// declare its own more specific one.
export default function AdminHomeLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-7 w-52" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
