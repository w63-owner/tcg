import { unstable_cache } from "next/cache";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  fetchListingsFeedPage,
  fetchSetOptions,
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
  async (filters: FeedFilters, page: number, pageSize: number) => {
    const supabase = createPublicServerClient();
    return fetchListingsFeedPage({
      supabase,
      filters,
      page,
      pageSize,
    });
  },
  ["public-feed-v1"],
  { revalidate: 20 },
);

export function getPublicSetOptionsCached() {
  return fetchPublicSetOptionsCached();
}

export function getPublicFeedCached(params: {
  filters: FeedFilters;
  page: number;
  pageSize: number;
  /** When set, excludes this user's listings from the feed (no cache). */
  excludeSellerId?: string;
}) {
  if (params.excludeSellerId) {
    const supabase = createPublicServerClient();
    return fetchListingsFeedPage({
      supabase,
      filters: params.filters,
      page: params.page,
      pageSize: params.pageSize,
      excludeSellerId: params.excludeSellerId,
    });
  }
  return fetchPublicFeedCached(params.filters, params.page, params.pageSize);
}
