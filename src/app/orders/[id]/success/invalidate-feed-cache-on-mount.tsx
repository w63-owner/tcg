"use client";

import { useEffect } from "react";
import { clearMarketplaceFeedCache } from "@/components/marketplace/infinite-listings-feed";

/**
 * Invalidates the marketplace feed session cache when the user lands on the order success page
 * with payment already confirmed, so "Retour à l'accueil" shows an up-to-date feed (listing no longer visible).
 */
export function InvalidateFeedCacheOnMount() {
  useEffect(() => {
    clearMarketplaceFeedCache();
  }, []);
  return null;
}
