import { unstable_cache } from "next/cache";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  fetchListingsFeedPage,
  fetchSetOptions,
  type FeedCursor,
  type FeedFilters,
} from "@/lib/listings/feed";

const fetchPublicSetOptionsCached = unstable_cache(
  async () => {
    const supabase = createPublicServerClient();
    return fetchSetOptions(supabase);
  },
  ["public-set-options-v1"],
  { revalidate: 60 * 10 },
);

const fetchPublicFeedCached = unstable_cache(
  async (
    filters: FeedFilters,
    cursor: FeedCursor | null,
    pageSize: number,
  ) => {
    const supabase = createPublicServerClient();
    return fetchListingsFeedPage({
      supabase,
      filters,
      cursor,
      pageSize,
    });
  },
  ["public-feed-v3"],
  { revalidate: 20 },
);

export function getPublicSetOptionsCached() {
  return fetchPublicSetOptionsCached();
}

export function getPublicFeedCached(params: {
  filters: FeedFilters;
  cursor?: FeedCursor | null;
  pageSize: number;
  /** When set, excludes this user's listings from the feed (no cache). */
  excludeSellerId?: string;
}) {
  if (params.excludeSellerId) {
    const supabase = createPublicServerClient();
    return fetchListingsFeedPage({
      supabase,
      filters: params.filters,
      cursor: params.cursor,
      pageSize: params.pageSize,
      excludeSellerId: params.excludeSellerId,
    });
  }
  return fetchPublicFeedCached(
    params.filters,
    params.cursor ?? null,
    params.pageSize,
  );
}
