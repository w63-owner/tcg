import type { SupabaseClient } from "@supabase/supabase-js";

export type ListingFeedRow = {
  id: string;
  title: string;
  cover_image_url: string | null;
  price_seller: number;
  display_price: number | null;
  condition: string | null;
  is_graded: boolean;
  grade_note: number | null;
  favorite_count: number;
};

type ListingFeedBaseRow = Omit<ListingFeedRow, "favorite_count">;

export type FeedFilters = {
  q: string;
  set: string;
  condition: string;
  is_graded: string;
  grade_min: number | null;
  grade_max: number | null;
  price_min: number | null;
  price_max: number | null;
  sort: string;
};

function parseOptionalNumber(value: string | undefined) {
  if (!value || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFeedFilters(params: Record<string, string | undefined>): FeedFilters {
  return {
    q: (params.q ?? "").trim(),
    set: (params.set ?? "").trim(),
    condition: (params.condition ?? "").trim(),
    is_graded: (params.is_graded ?? "").trim(),
    grade_min: parseOptionalNumber(params.grade_min),
    grade_max: parseOptionalNumber(params.grade_max),
    price_min: parseOptionalNumber(params.price_min),
    price_max: parseOptionalNumber(params.price_max),
    sort: (params.sort ?? "date_desc").trim(),
  };
}

export async function fetchSetOptions(supabase: SupabaseClient) {
  const { data: setRows } = await supabase
    .from("cards_ref")
    .select("set_id")
    .order("set_id", { ascending: true })
    .limit(500);

  return Array.from(new Set((setRows ?? []).map((row) => row.set_id).filter(Boolean)));
}

export async function fetchCardRefIdsByQuery(supabase: SupabaseClient, query: string) {
  const term = query.trim();
  if (!term) return [] as string[];

  const { data } = await supabase
    .from("cards_ref")
    .select("id")
    .or(
      `name.ilike.%${term}%,set_id.ilike.%${term}%,tcg_id.ilike.%${term}%,card_number.ilike.%${term}%,language.ilike.%${term}%,release_year.ilike.%${term}%`,
    )
    .limit(2000);

  return (data ?? []).map((row) => row.id as string);
}

export async function fetchListingsFeedPage(params: {
  supabase: SupabaseClient;
  filters: FeedFilters;
  page: number;
  pageSize: number;
}) {
  const { supabase, filters, page, pageSize } = params;

  const pageNumber = Math.max(1, Number(page) || 1);
  const rangeFrom = (pageNumber - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize;

  const queryCardRefIds = filters.q
    ? await fetchCardRefIdsByQuery(supabase, filters.q)
    : [];

  let cardRefIds: string[] | null = null;
  if (filters.set) {
    const { data: cardRefs } = await supabase
      .from("cards_ref")
      .select("id")
      .eq("set_id", filters.set)
      .limit(2000);
    cardRefIds = (cardRefs ?? []).map((row) => row.id);
    if (cardRefIds.length === 0) {
      return { listings: [] as ListingFeedRow[], hasNextPage: false, error: null };
    }
  }

  let request = supabase
    .from("listings")
    .select(
      "id, title, cover_image_url, price_seller, display_price, condition, is_graded, grade_note, card_ref_id, created_at",
    )
    .eq("status", "ACTIVE");
  let tieBreakAscending = false;

  if (filters.q) {
    if (queryCardRefIds.length > 0) {
      request = request.or(
        `title.ilike.%${filters.q}%,card_ref_id.in.(${queryCardRefIds.join(",")})`,
      );
    } else {
      request = request.ilike("title", `%${filters.q}%`);
    }
  }
  if (filters.set && cardRefIds) {
    request = request.in("card_ref_id", cardRefIds);
  }
  if (filters.condition) {
    request = request.eq("condition", filters.condition);
  }
  if (filters.is_graded === "1") {
    request = request.eq("is_graded", true);
  } else if (filters.is_graded === "0") {
    request = request.eq("is_graded", false);
  }
  if (filters.grade_min !== null) {
    request = request.gte("grade_note", filters.grade_min);
  }
  if (filters.grade_max !== null) {
    request = request.lte("grade_note", filters.grade_max);
  }
  if (filters.price_min !== null) {
    request = request.gte("display_price", filters.price_min);
  }
  if (filters.price_max !== null) {
    request = request.lte("display_price", filters.price_max);
  }

  if (filters.sort === "price_asc") {
    request = request.order("display_price", { ascending: true });
    tieBreakAscending = true;
  } else if (filters.sort === "price_desc") {
    request = request.order("display_price", { ascending: false });
  } else if (filters.sort === "date_asc") {
    request = request.order("created_at", { ascending: true });
    tieBreakAscending = true;
  } else if (filters.sort === "grade_desc") {
    request = request.order("grade_note", { ascending: false, nullsFirst: false });
  } else if (filters.sort === "grade_asc") {
    request = request.order("grade_note", { ascending: true, nullsFirst: true });
    tieBreakAscending = true;
  } else {
    request = request.order("created_at", { ascending: false });
  }

  // Deterministic tie-breaker to avoid duplicate/shifted rows between pages.
  request = request.order("id", { ascending: tieBreakAscending });

  request = request.range(rangeFrom, rangeTo);
  const { data, error } = await request;
  if (error) {
    return { listings: [] as ListingFeedRow[], hasNextPage: false, error: error.message };
  }

  const rows = (data ?? []) as ListingFeedBaseRow[];
  const hasNextPage = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);

  const favoriteCountsByListingId = new Map<string, number>();
  if (pageRows.length > 0) {
    const listingIds = pageRows.map((row) => row.id);
    const { data: favoriteRows } = await supabase
      .from("favorite_listings")
      .select("listing_id")
      .in("listing_id", listingIds);

    for (const row of favoriteRows ?? []) {
      const key = row.listing_id as string;
      favoriteCountsByListingId.set(key, (favoriteCountsByListingId.get(key) ?? 0) + 1);
    }
  }

  return {
    listings: pageRows.map((row) => ({
      ...row,
      favorite_count: favoriteCountsByListingId.get(row.id) ?? 0,
    })),
    hasNextPage,
    error: null,
  };
}
