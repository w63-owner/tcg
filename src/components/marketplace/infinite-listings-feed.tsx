"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
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

type FeedPage = {
  listings: ListingFeedRow[];
  nextCursor: string | null;
  hasNextPage: boolean;
  favoriteListingIds: string[];
  error?: string;
};

const FEED_QUERY_KEY_PREFIX = ["listings", "feed"] as const;

function buildFeedQueryKey(queryString: string) {
  return [...FEED_QUERY_KEY_PREFIX, queryString || "default"] as const;
}

async function fetchFeedPage(
  queryString: string,
  cursor: string | null,
): Promise<FeedPage> {
  const params = new URLSearchParams(queryString);
  params.set("pageSize", "40");
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/listings/feed?${params.toString()}`);
  const json = (await response.json()) as FeedPage & { error?: string };
  if (!response.ok || json.error) {
    throw new Error(json.error ?? "Impossible de charger plus d'annonces.");
  }
  return {
    listings: json.listings,
    nextCursor: json.nextCursor ?? null,
    hasNextPage: Boolean(json.hasNextPage),
    favoriteListingIds: json.favoriteListingIds ?? [],
  };
}

type ListingItem = ListingFeedRow & {
  initialFavorite: boolean;
};

function flattenPagesToItems(pages: FeedPage[]): ListingItem[] {
  const favoriteIds = new Set(
    pages.flatMap((p) => p.favoriteListingIds),
  );
  const byId = new Map<string, ListingItem>();
  for (const page of pages) {
    for (const listing of page.listings) {
      byId.set(listing.id, {
        ...listing,
        initialFavorite: favoriteIds.has(listing.id),
      });
    }
  }
  return Array.from(byId.values());
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

  const queryKey = useMemo(
    () => buildFeedQueryKey(queryString),
    [queryString],
  );

  const initialPage: FeedPage = useMemo(
    () => ({
      listings: initialListings,
      nextCursor: initialNextCursor,
      hasNextPage: initialHasNextPage,
      favoriteListingIds: initialFavoriteListingIds,
    }),
    [
      initialListings,
      initialNextCursor,
      initialHasNextPage,
      initialFavoriteListingIds,
    ],
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    error,
    status,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchFeedPage(queryString, pageParam as string | null),
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    initialData: {
      pages: [initialPage],
      pageParams: [undefined],
    },
    // Uses QueryClient default staleTime (1 min); feed is cached per filter set
  });

  const items = useMemo(
    () => (data?.pages ? flattenPagesToItems(data.pages) : []),
    [data?.pages],
  );

  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { rootMargin: "280px 0px 280px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, loadMore]);

  const loadError =
    status === "error" && error instanceof Error ? error.message : null;

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
            onClick={() => loadMore()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Chargement..." : "Charger plus"}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-center text-xs">Fin des resultats.</p>
      )}
    </div>
  );
}

/** Query key prefix for feed; use with invalidateQueries / removeQueries to clear all feed cache. */
export const marketplaceFeedQueryKey = FEED_QUERY_KEY_PREFIX;

/**
 * Call this to invalidate the React Query feed cache (e.g. after order success so the listing disappears).
 * Replaces the previous sessionStorage-based clearMarketplaceFeedCache.
 */
export function useInvalidateFeedCache() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_PREFIX });
  }, [queryClient]);
}
