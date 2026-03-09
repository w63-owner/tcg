import type { SupabaseClient } from "@supabase/supabase-js";

export type ListingFeedRow = {
  id: string;
  title: string;
  cover_image_url: string | null;
  price_seller: number;
  display_price: number | null;
  condition: string | null;
  is_graded: boolean;
  grading_company: string | null;
  grade_note: number | null;
  language: string | null;
  favorite_count: number;
};

type FeedPerformance = {
  cardFilterMs: number;
  listingQueryMs: number;
  postProcessMs: number;
  totalMs: number;
};

export type FeedFilters = {
  q: string;
  set: string;
  rarity: string;
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
    rarity: (params.rarity ?? "").trim(),
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
    .from("tcgdex_sets")
    .select("name")
    .order("name", { ascending: true })
    .limit(500);

  return Array.from(new Set((setRows ?? []).map((row) => row.name).filter(Boolean)));
}

export async function fetchListingsFeedPage(params: {
  supabase: SupabaseClient;
  filters: FeedFilters;
  page: number;
  pageSize: number;
  /** When set, listings from this seller are excluded (e.g. current user's own listings). */
  excludeSellerId?: string;
}) {
  const { supabase, filters, page, pageSize, excludeSellerId } = params;
  const totalStart = performance.now();

  const pageNumber = Math.max(1, Number(page) || 1);
  const offset = (pageNumber - 1) * pageSize;
  const limit = pageSize + 1;

  const isGradedBoolean: boolean | null =
    filters.is_graded === "1" ? true : filters.is_graded === "0" ? false : null;

  const listingQueryStart = performance.now();
  const { data: rows, error } = await supabase.rpc("search_listings_feed", {
    p_q: filters.q || null,
    p_set: filters.set || null,
    p_rarity: filters.rarity || null,
    p_condition: filters.condition || null,
    p_is_graded: isGradedBoolean,
    p_grade_min: filters.grade_min ?? null,
    p_grade_max: filters.grade_max ?? null,
    p_price_min: filters.price_min ?? null,
    p_price_max: filters.price_max ?? null,
    p_sort: filters.sort || "date_desc",
    p_offset: offset,
    p_limit: limit,
    p_exclude_seller_id: excludeSellerId ?? null,
  });
  const listingQueryMs = performance.now() - listingQueryStart;

  if (error) {
    return {
      listings: [] as ListingFeedRow[],
      hasNextPage: false,
      error: error.message,
      performance: {
        cardFilterMs: 0,
        listingQueryMs: Number(listingQueryMs.toFixed(1)),
        postProcessMs: 0,
        totalMs: Number((performance.now() - totalStart).toFixed(1)),
      } satisfies FeedPerformance,
    };
  }

  const rawRows = (rows ?? []) as Array<{
    id: string;
    title: string;
    cover_image_url: string | null;
    price_seller: number;
    display_price: number | null;
    condition: string | null;
    is_graded: boolean;
    grading_company: string | null;
    grade_note: number | null;
    card_ref_id: string | null;
    created_at: string;
    language: string | null;
    favorite_count: number;
  }>;
  const hasNextPage = rawRows.length > pageSize;
  const pageRows = rawRows.slice(0, pageSize);

  const totalMs = performance.now() - totalStart;
  return {
    listings: pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      cover_image_url: row.cover_image_url,
      price_seller: row.price_seller,
      display_price: row.display_price,
      condition: row.condition,
      is_graded: row.is_graded,
      grading_company: row.grading_company,
      grade_note: row.grade_note,
      language: row.language,
      favorite_count: Number(row.favorite_count ?? 0),
    })),
    hasNextPage,
    error: null,
    performance: {
      cardFilterMs: 0,
      listingQueryMs: Number(listingQueryMs.toFixed(1)),
      postProcessMs: 0,
      totalMs: Number(totalMs.toFixed(1)),
    } satisfies FeedPerformance,
  };
}
