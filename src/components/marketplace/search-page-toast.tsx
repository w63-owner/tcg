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
  const listingId = String(searchParams.get("listing_id") ?? "").trim();
  const listingHref = listingId ? `/listing/${listingId}` : "";

  useEffect(() => {
    if (!isPublished || handledRef.current) return;

    handledRef.current = true;
    toast.success("Annonce publiee.", {
      action: listingHref
        ? {
            label: "Voir la fiche",
            onClick: () => router.push(listingHref),
          }
        : undefined,
    });

    const cleanupTimeout = setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("published");
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, 3500);

    return () => clearTimeout(cleanupTimeout);
  }, [isPublished, listingHref, pathname, router, searchParams]);

  return isPublished ? (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center">
      <div className="bg-background/95 border-primary/30 text-foreground flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-lg backdrop-blur animate-pulse">
        <CheckCircle2 className="text-primary h-4 w-4" />
        <span className="text-xs font-medium">Annonce publiee</span>
        {listingHref ? (
          <button
            type="button"
            onClick={() => router.push(listingHref)}
            className="pointer-events-auto text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
          >
            Voir la fiche
          </button>
        ) : null}
      </div>
    </div>
  ) : null;
}
