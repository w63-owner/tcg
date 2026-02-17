import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchListingsFeedPage, parseFeedFilters } from "@/lib/listings/feed";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = 40;
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const feed = await fetchListingsFeedPage({
    supabase,
    filters,
    page,
    pageSize,
  });

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

  return NextResponse.json({
    listings: feed.listings,
    hasNextPage: feed.hasNextPage,
    favoriteListingIds,
  });
}
