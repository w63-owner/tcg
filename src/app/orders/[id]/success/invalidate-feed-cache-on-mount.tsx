"use client";

import { useEffect } from "react";
import { useInvalidateFeedCache } from "@/components/marketplace/infinite-listings-feed";

/**
 * Invalidates the marketplace feed React Query cache when the user lands on the order success page
 * with payment already confirmed, so "Retour à l'accueil" shows an up-to-date feed (listing no longer visible).
 */
export function InvalidateFeedCacheOnMount() {
  const invalidateFeed = useInvalidateFeedCache();
  useEffect(() => {
    invalidateFeed();
  }, [invalidateFeed]);
  return null;
}
