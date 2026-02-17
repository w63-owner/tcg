"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function SearchPageToast() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handledRef = useRef(false);
  const isPublished = searchParams.get("published") === "1";

  useEffect(() => {
    if (!isPublished || handledRef.current) return;

    handledRef.current = true;
    toast.success("Ton annonce vient d'etre publiee.");

    const cleanupTimeout = setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("published");
      nextParams.delete("listing_id");
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, 1200);

    return () => clearTimeout(cleanupTimeout);
  }, [isPublished, pathname, router, searchParams]);

  return isPublished ? (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center">
      <div className="bg-background/95 border-primary/30 text-foreground flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-lg backdrop-blur animate-pulse">
        <CheckCircle2 className="text-primary h-4 w-4" />
        <span className="text-xs font-medium">Annonce publiee</span>
      </div>
    </div>
  ) : null;
}
