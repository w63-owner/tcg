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

/** Cursor for keyset pagination (opaque for API: encode/decode as base64 JSON). */
export type FeedCursor = {
  id: string;
  created_at: string;
  display_price: number | null;
  grade_note: number | null;
};

const FEED_PAGE_SIZE_MAX = 50;

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

type RawFeedRow = {
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
};

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64url");
}

export function decodeFeedCursor(token: string | null | undefined): FeedCursor | null {
  if (!token || typeof token !== "string" || token.trim() === "") return null;
  try {
    const raw = JSON.parse(
      Buffer.from(token, "base64url").toString("utf-8"),
    ) as unknown;
    if (
      raw &&
      typeof raw === "object" &&
      "id" in raw &&
      typeof (raw as FeedCursor).id === "string" &&
      "created_at" in raw &&
      typeof (raw as FeedCursor).created_at === "string"
    ) {
      const c = raw as FeedCursor;
      return {
        id: c.id,
        created_at: c.created_at,
        display_price: typeof c.display_price === "number" ? c.display_price : null,
        grade_note: typeof c.grade_note === "number" ? c.grade_note : null,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function fetchListingsFeedPage(params: {
  supabase: SupabaseClient;
  filters: FeedFilters;
  /** Cursor from previous page (opaque token or decoded). Omit for first page. */
  cursor?: FeedCursor | null;
  pageSize: number;
  /** When set, listings from this seller are excluded (e.g. current user's own listings). */
  excludeSellerId?: string;
}) {
  const { supabase, filters, cursor, pageSize, excludeSellerId } = params;
  const totalStart = performance.now();
  const cappedSize = Math.min(FEED_PAGE_SIZE_MAX, Math.max(1, pageSize));
  const limit = cappedSize + 1;

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
    p_cursor_id: cursor?.id ?? null,
    p_cursor_created_at: cursor?.created_at ?? null,
    p_cursor_display_price: cursor?.display_price ?? null,
    p_cursor_grade_note: cursor?.grade_note ?? null,
    p_limit: limit,
    p_exclude_seller_id: excludeSellerId ?? null,
  });
  const listingQueryMs = performance.now() - listingQueryStart;

  if (error) {
    return {
      listings: [] as ListingFeedRow[],
      nextCursor: null,
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

  const rawRows = (rows ?? []) as RawFeedRow[];
  const hasNextPage = rawRows.length > cappedSize;
  const pageRows = rawRows.slice(0, cappedSize);
  const last = pageRows[pageRows.length - 1];
  const nextCursor: FeedCursor | null =
    hasNextPage && last
      ? {
          id: last.id,
          created_at: last.created_at,
          display_price: last.display_price ?? null,
          grade_note: last.grade_note ?? null,
        }
      : null;

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
    nextCursor,
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
