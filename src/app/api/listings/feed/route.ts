import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  fetchListingsFeedPage,
  parseFeedFilters,
} from "@/lib/listings/feed";
import { getPublicFeedCached } from "@/lib/listings/feed-cache";
import { logPerf, toServerTimingHeader } from "@/lib/perf/timing";

const DEFAULT_PAGE_SIZE = 40;

export async function GET(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const cursorToken = url.searchParams.get("cursor") ?? undefined;
  const cursor = decodeFeedCursor(cursorToken);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));
  const filters = parseFeedFilters({
    q: url.searchParams.get("q") ?? undefined,
    set: url.searchParams.get("set") ?? undefined,
    rarity: url.searchParams.get("rarity") ?? undefined,
    condition: url.searchParams.get("condition") ?? undefined,
    is_graded: url.searchParams.get("is_graded") ?? undefined,
    grade_min: url.searchParams.get("grade_min") ?? undefined,
    grade_max: url.searchParams.get("grade_max") ?? undefined,
    price_min: url.searchParams.get("price_min") ?? undefined,
    price_max: url.searchParams.get("price_max") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
  });

  const supabase = await createClient();
  const authStart = performance.now();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authMs = performance.now() - authStart;

  const feedStart = performance.now();
  const feed = user
    ? await fetchListingsFeedPage({
        supabase,
        filters,
        cursor,
        pageSize,
        excludeSellerId: user.id,
      })
    : await getPublicFeedCached({
        filters,
        cursor,
        pageSize,
      });
  const feedMs = performance.now() - feedStart;

  if (feed.error) {
    return NextResponse.json({ error: feed.error }, { status: 500 });
  }

  let favoriteListingIds: string[] = [];
  if (user && feed.listings.length > 0) {
    const listingIds = feed.listings.map((listing) => listing.id);
    const { data: favoriteRows } = await supabase
      .from("favorite_listings")
      .select("listing_id")
      .eq("user_id", user.id)
      .in("listing_id", listingIds);

    favoriteListingIds = (favoriteRows ?? []).map((row) => row.listing_id as string);
  }

  const response = NextResponse.json({
    listings: feed.listings,
    nextCursor: feed.nextCursor ? encodeFeedCursor(feed.nextCursor) : null,
    hasNextPage: feed.hasNextPage,
    favoriteListingIds,
  });
  const totalMs = performance.now() - startedAt;
  const timings = [
    { label: "auth", durationMs: authMs },
    { label: "feed", durationMs: feed.performance?.totalMs ?? feedMs },
    { label: "api", durationMs: totalMs },
  ];
  response.headers.set("Server-Timing", toServerTimingHeader(timings));

  logPerf("api.listings.feed.timings", timings, {
    hasUser: Boolean(user),
    pageSize,
    listingsCount: feed.listings.length,
  });

  return response;
}
