import { Skeleton } from "@/components/ui/skeleton";

export default function GlobalLoading() {
  return (
    <section className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-xl border p-2">
            <Skeleton className="aspect-[3/4] w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </section>
  );
}
