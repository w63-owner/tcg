import { Skeleton } from "@/components/ui/skeleton";

export default function MessagesLoading() {
  return (
    <section className="space-y-4">
      <Skeleton className="h-8 w-36" />
      <div className="space-y-3 rounded-xl border p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
