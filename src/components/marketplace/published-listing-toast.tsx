"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * When the URL has published=1&listing_id=..., shows a single Sonner toast
 * "Annonce publiee" with action "Voir la fiche", then removes the params from the URL.
 * Used in the root layout so it works after redirect from sell form (homepage or any page).
 */
export function PublishedListingToast() {
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
      nextParams.delete("listing_id");
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, 3500);

    return () => clearTimeout(cleanupTimeout);
  }, [isPublished, listingHref, pathname, router, searchParams]);

  return null;
}
