"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardItem } from "@/components/marketplace/card-item";
import { Button } from "@/components/ui/button";
import type { ListingFeedRow } from "@/lib/listings/feed";

type InfiniteListingsFeedProps = {
  initialListings: ListingFeedRow[];
  initialFavoriteListingIds: string[];
  initialHasNextPage: boolean;
  filters: Record<string, string | undefined>;
  showFavoriteToggle: boolean;
  fromHref: string;
};

type FeedApiResponse = {
  listings: ListingFeedRow[];
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
  const [page, setPage] = useState(1);
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
        setPage(1);
        setHasNextPage(initialHasNextPage);
        return;
      }
      const parsed = JSON.parse(raw) as {
        items?: ListingItem[];
        page?: number;
        hasNextPage?: boolean;
      };
      if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
        setItems(toListingItems(initialListings, initialFavoriteListingIds));
        setPage(1);
        setHasNextPage(initialHasNextPage);
        return;
      }
      setItems(parsed.items);
      setPage(Math.max(1, Number(parsed.page ?? 1) || 1));
      setHasNextPage(Boolean(parsed.hasNextPage));
    } catch {
      setItems(toListingItems(initialListings, initialFavoriteListingIds));
      setPage(1);
      setHasNextPage(initialHasNextPage);
    }
  }, [cacheKey, initialHasNextPage, initialFavoriteListingIds, initialListings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({
      items,
      page,
      hasNextPage,
    });
    window.sessionStorage.setItem(cacheKey, payload);
  }, [cacheKey, hasNextPage, items, page]);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || isLoadingMore || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const nextPage = page + 1;
      const qs = queryString ? `${queryString}&page=${nextPage}` : `page=${nextPage}`;
      const response = await fetch(`/api/listings/feed?${qs}`);
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
      setPage(nextPage);
      setHasNextPage(Boolean(json.hasNextPage));
    } catch {
      setLoadError("Erreur reseau lors du chargement.");
    } finally {
      inFlightRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasNextPage, isLoadingMore, page, queryString]);

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
