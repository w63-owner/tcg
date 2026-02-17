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

export function InfiniteListingsFeed({
  initialListings,
  initialFavoriteListingIds,
  initialHasNextPage,
  filters,
  showFavoriteToggle,
  fromHref,
}: InfiniteListingsFeedProps) {
  const [items, setItems] = useState<ListingItem[]>(
    Array.from(
      new Map(
        initialListings.map((listing) => [
          listing.id,
          {
            ...listing,
            initialFavorite: initialFavoriteListingIds.includes(listing.id),
          },
        ]),
      ).values(),
    ),
  );
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value.trim()) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || isLoadingMore) return;
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
            gradeNote={listing.grade_note}
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
