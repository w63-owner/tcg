"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardItem } from "@/components/marketplace/card-item";
import { Button } from "@/components/ui/button";
import type { ListingFeedRow } from "@/lib/listings/feed";

type InfiniteListingsFeedProps = {
  initialListings: ListingFeedRow[];
  initialFavoriteListingIds: string[];
  initialHasNextPage: boolean;
  /** Opaque cursor for the next page (from previous response). */
  initialNextCursor: string | null;
  filters: Record<string, string | undefined>;
  showFavoriteToggle: boolean;
  fromHref: string;
};

type FeedApiResponse = {
  listings: ListingFeedRow[];
  nextCursor: string | null;
  hasNextPage: boolean;
  favoriteListingIds: string[];
  error?: string;
};

type ListingItem = ListingFeedRow & {
  initialFavorite: boolean;
};

function toListingItems(listings: ListingFeedRow[], favoriteIds: string[]) {
  return Array.from(
    new Map(
      listings.map((listing) => [
        listing.id,
        {
          ...listing,
          initialFavorite: favoriteIds.includes(listing.id),
        },
      ]),
    ).values(),
  );
}

export function InfiniteListingsFeed({
  initialListings,
  initialFavoriteListingIds,
  initialHasNextPage,
  initialNextCursor,
  filters,
  showFavoriteToggle,
  fromHref,
}: InfiniteListingsFeedProps) {
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value.trim()) params.set(key, value);
    });
    return params.toString();
  }, [filters]);
  const cacheKey = useMemo(
    () => `marketplace-feed:${queryString || "default"}`,
    [queryString],
  );
  const [items, setItems] = useState<ListingItem[]>(
    toListingItems(initialListings, initialFavoriteListingIds),
  );
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (!raw) {
        setItems(toListingItems(initialListings, initialFavoriteListingIds));
        setNextCursor(initialNextCursor);
        setHasNextPage(initialHasNextPage);
        return;
      }
      const parsed = JSON.parse(raw) as {
        items?: ListingItem[];
        nextCursor?: string | null;
        hasNextPage?: boolean;
        timestamp?: number;
      };
      if (!parsed.timestamp || Date.now() - parsed.timestamp > 300000)
        throw new Error("Cache expiré");
      if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
        setItems(toListingItems(initialListings, initialFavoriteListingIds));
        setNextCursor(initialNextCursor);
        setHasNextPage(initialHasNextPage);
        return;
      }
      setItems(parsed.items);
      setNextCursor(parsed.nextCursor ?? null);
      setHasNextPage(Boolean(parsed.hasNextPage));
    } catch {
      setItems(toListingItems(initialListings, initialFavoriteListingIds));
      setNextCursor(initialNextCursor);
      setHasNextPage(initialHasNextPage);
    }
  }, [cacheKey, initialHasNextPage, initialNextCursor, initialFavoriteListingIds, initialListings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({
      items,
      nextCursor,
      hasNextPage,
      timestamp: Date.now(),
    });
    window.sessionStorage.setItem(cacheKey, payload);
  }, [cacheKey, hasNextPage, items, nextCursor]);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || isLoadingMore || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams(queryString);
      params.set("pageSize", "40");
      if (nextCursor) params.set("cursor", nextCursor);
      const response = await fetch(`/api/listings/feed?${params.toString()}`);
      const json = (await response.json()) as FeedApiResponse;
      if (!response.ok || json.error) {
        setLoadError(json.error ?? "Impossible de charger plus d'annonces.");
        return;
      }

      const nextItems = json.listings.map((listing) => ({
        ...listing,
        initialFavorite: json.favoriteListingIds.includes(listing.id),
      }));
      setItems((previous) =>
        Array.from(
          new Map([...previous, ...nextItems].map((item) => [item.id, item])).values(),
        ),
      );
      setNextCursor(json.nextCursor ?? null);
      setHasNextPage(Boolean(json.hasNextPage));
    } catch {
      setLoadError("Erreur reseau lors du chargement.");
    } finally {
      inFlightRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasNextPage, isLoadingMore, nextCursor, queryString]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "280px 0px 280px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, loadMore]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        {items.map((listing) => (
          <CardItem
            key={listing.id}
            href={`/listing/${listing.id}?from=${encodeURIComponent(fromHref || "/")}`}
            id={listing.id}
            title={listing.title}
            coverImageUrl={listing.cover_image_url}
            priceSeller={listing.price_seller}
            displayPrice={listing.display_price}
            condition={listing.condition}
            isGraded={listing.is_graded}
            gradingCompany={listing.grading_company}
            gradeNote={listing.grade_note}
            language={listing.language}
            favoriteCount={listing.favorite_count}
            showFavoriteToggle={showFavoriteToggle}
            initialFavorite={listing.initialFavorite}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="h-4 w-full" />

      {loadError ? (
        <p className="text-destructive text-center text-sm">{loadError}</p>
      ) : null}

      {hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Chargement..." : "Charger plus"}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-center text-xs">Fin des resultats.</p>
      )}
    </div>
  );
}

export function clearMarketplaceFeedCache() {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith("marketplace-feed:")) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => sessionStorage.removeItem(k));
}
