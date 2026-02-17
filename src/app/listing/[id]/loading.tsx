import { Skeleton } from "@/components/ui/skeleton";

export default function ListingLoading() {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-0 sm:grid-cols-2">
          <Skeleton className="aspect-[3/4] w-full" />
          <Skeleton className="aspect-[3/4] w-full" />
        </div>
      </div>
      <div className="space-y-3 rounded-xl border p-4">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </section>
  );
}
