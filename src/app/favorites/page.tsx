import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Heart, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import { fetchCardRefIdsByQuery } from "@/lib/listings/feed";
import { formatListingStatusLabel } from "@/lib/listings/status-label";
import { removeFavoriteListing, removeFavoriteSeller } from "./actions";
import { SavedSearchesRealtimeListener } from "./saved-searches-realtime-listener";
import { SavedSearchItem } from "./saved-search-item";

type FavoriteListingRow = {
  listing_id: string;
  created_at: string;
  listing:
    | {
        id: string;
        title: string;
        cover_image_url: string | null;
        display_price: number | null;
        status: string;
      }
    | Array<{
        id: string;
        title: string;
        cover_image_url: string | null;
        display_price: number | null;
        status: string;
      }>
    | null;
};

type FavoriteSeller = {
  id: string;
  username: string;
  avatar_url: string | null;
  country_code: string;
};

type FavoriteSellerRow = {
  seller_id: string;
  created_at: string;
  seller: FavoriteSeller | Array<FavoriteSeller> | null;
};

type SellerDisplayRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  review_count: number;
  rating_avg: number;
  updated_at: string;
};

type SavedSearchRow = {
  id: string;
  name: string;
  search_params: Record<string, string>;
  created_at: string;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type ListingPreview = {
    id: string;
    title: string;
    cover_image_url: string | null;
    display_price: number | null;
    status: string;
};

function buildSearchHref(params: Record<string, string>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value?.trim()) {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `/?${query}` : "/";
}

function buildSearchEditorHref(params: Record<string, string>, savedSearchId: string) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value?.trim()) {
      search.set(key, value);
    }
  });
  search.set("saved_search_id", savedSearchId);
  return `/search?${search.toString()}`;
}

function parseOptionalNumber(value: string | undefined) {
  if (!value || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSavedSearchTitle(row: SavedSearchRow) {
  return row.search_params.q?.trim() || row.name || "Recherche sauvegardee";
}

function formatCondition(condition: string) {
  const map: Record<string, string> = {
    MINT: "Mint",
    NEAR_MINT: "Near mint",
    EXCELLENT: "Excellent",
    GOOD: "Good",
    LIGHT_PLAYED: "Light played",
    PLAYED: "Played",
    POOR: "Poor",
  };
  return map[condition] ?? condition;
}

function formatSort(sort: string) {
  const map: Record<string, string> = {
    date_desc: "Plus recent",
    date_asc: "Plus ancien",
    price_asc: "Prix croissant",
    price_desc: "Prix decroissant",
    grade_desc: "Note decroissante",
    grade_asc: "Note croissante",
  };
  return map[sort] ?? sort;
}

function formatRarity(rarity: string) {
  const map: Record<string, string> = {
    COMMON: "Commune",
    UNCOMMON: "Peu commune",
    RARE: "Rare",
    HOLO_RARE: "Rare holo",
    ULTRA_RARE: "Ultra rare",
    SECRET_RARE: "Secrete rare",
    PROMO: "Promo",
    SIR: "SIR",
    IR: "IR",
  };
  return map[rarity] ?? rarity;
}

function describeSavedSearchCriteria(params: Record<string, string>) {
  const criteria: string[] = [];
  if (params.set) criteria.push(params.set);
  if (params.rarity) criteria.push(formatRarity(params.rarity));
  if (params.condition) criteria.push(formatCondition(params.condition));
  if (params.is_graded === "1") criteria.push("Gradee");
  if (params.is_graded === "0") criteria.push("Non gradee");
  if (params.grade_min || params.grade_max) {
    criteria.push(`${params.grade_min || "1"}-${params.grade_max || "10"}`);
  }
  if (params.price_min || params.price_max) {
    criteria.push(`${params.price_min || "0"}-${params.price_max || "∞"} EUR`);
  }
  if (params.sort && params.sort !== "date_desc") criteria.push(formatSort(params.sort));
  return criteria;
}

async function countNewListingsForSavedSearch(
  supabase: Awaited<ReturnType<typeof requireAuthenticatedUser>>["supabase"],
  row: SavedSearchRow,
) {
  const params = row.search_params ?? {};
  const query = (params.q ?? "").trim();
  const setFilter = (params.set ?? "").trim();
  const rarityFilter = (params.rarity ?? "").trim();
  const condition = (params.condition ?? "").trim();
  const isGraded = (params.is_graded ?? "").trim();
  const gradeMin = parseOptionalNumber(params.grade_min);
  const gradeMax = parseOptionalNumber(params.grade_max);
  const priceMin = parseOptionalNumber(params.price_min);
  const priceMax = parseOptionalNumber(params.price_max);
  const queryCardRefIds = query ? await fetchCardRefIdsByQuery(supabase, query) : [];

  let cardRefIds: string[] | null = null;
  if (setFilter || rarityFilter) {
    let cardRefRequest = supabase.from("tcgdex_cards").select("card_key");
    if (setFilter) {
      cardRefRequest = cardRefRequest.eq("set_name", setFilter);
    }
    if (rarityFilter) {
      cardRefRequest = cardRefRequest.eq("rarity", rarityFilter);
    }
    const { data: cardRefs } = await cardRefRequest.limit(2000);
    cardRefIds = (cardRefs ?? []).map((card) => card.card_key);
    if (cardRefIds.length === 0) return 0;
  }

  let request = supabase
    .from("listings")
    .select("id", { head: true, count: "exact" })
    .eq("status", "ACTIVE")
    .gt("created_at", row.created_at);

  if (query) {
    if (queryCardRefIds.length > 0) {
      request = request.or(`title.ilike.%${query}%,card_ref_id.in.(${queryCardRefIds.join(",")})`);
    } else {
      request = request.ilike("title", `%${query}%`);
    }
  }
  if ((setFilter || rarityFilter) && cardRefIds) request = request.in("card_ref_id", cardRefIds);
  if (condition) request = request.eq("condition", condition);
  if (isGraded === "1") request = request.eq("is_graded", true);
  if (isGraded === "0") request = request.eq("is_graded", false);
  if (gradeMin !== null) request = request.gte("grade_note", gradeMin);
  if (gradeMax !== null) request = request.lte("grade_note", gradeMax);
  if (priceMin !== null) request = request.gte("display_price", priceMin);
  if (priceMax !== null) request = request.lte("display_price", priceMax);

  const { count } = await request;
  return Number(count ?? 0);
}

export default async function FavoritesPage() {
  const { supabase, user } = await requireAuthenticatedUser("/favorites");

  const [{ data: listingRows }, { data: sellerRows }, { data: savedRows }] =
    await Promise.all([
      supabase
        .from("favorite_listings")
        .select(
          "listing_id, created_at, listing:listings(id, title, cover_image_url, display_price, status)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("favorite_sellers")
        .select(
          "seller_id, created_at, seller:profiles!favorite_sellers_seller_id_fkey(id, username, avatar_url, country_code)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("saved_searches")
        .select("id, name, search_params, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  const favoriteListings = (listingRows ?? []) as FavoriteListingRow[];
  const favoriteSellerRows = (sellerRows ?? []) as FavoriteSellerRow[];
  const favoriteSellersWithDisplay = await Promise.all(
    favoriteSellerRows.map(async (row) => {
      const { data } = await supabase.rpc("get_seller_display", {
        p_seller_id: row.seller_id,
      });
      const display = (data as SellerDisplayRow[] | null)?.[0] ?? null;
      return { seller_id: row.seller_id, created_at: row.created_at, display };
    }),
  );
  const favoriteSellers = favoriteSellersWithDisplay.filter((s) => s.display != null) as Array<{
    seller_id: string;
    created_at: string;
    display: SellerDisplayRow;
  }>;
  const savedSearches = (savedRows ?? []) as SavedSearchRow[];
  const savedSearchesWithMeta = await Promise.all(
    savedSearches.map(async (row) => ({
      ...row,
      displayTitle: getSavedSearchTitle(row),
      criteria: describeSavedSearchCriteria(row.search_params ?? {}),
      newMatchesCount: await countNewListingsForSavedSearch(supabase, row),
    })),
  );
  const totalNewMatches = savedSearchesWithMeta.reduce(
    (sum, row) => sum + row.newMatchesCount,
    0,
  );

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Favoris</h1>
        <p className="text-muted-foreground text-sm">
          Retrouve tes annonces, recherches et vendeurs favoris.
        </p>
      </header>

      <Tabs defaultValue="listings">
        <TabsList variant="line" className="grid w-full grid-cols-3">
          <TabsTrigger value="listings">Annonces</TabsTrigger>
          <TabsTrigger value="searches">Recherches</TabsTrigger>
          <TabsTrigger value="sellers">Vendeurs</TabsTrigger>
        </TabsList>

        <TabsContent value="listings">
          <div className="space-y-3">
            <h2 className="text-base font-semibold">Annonces favorites</h2>
            {favoriteListings.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Tu n&apos;as pas encore ajoute d&apos;annonce en favoris.
              </p>
            ) : (
              <div className="divide-border/60 divide-y">
                {favoriteListings.map((row) => (
                  (() => {
                    const listing = pickOne<ListingPreview>(row.listing);

                    return (
                      <div
                        key={row.listing_id}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <Link
                          href={`/listing/${row.listing_id}`}
                          className="flex min-w-0 items-start gap-3"
                        >
                          <div className="bg-muted relative h-14 w-12 shrink-0 overflow-hidden rounded-sm border">
                            {listing?.cover_image_url ? (
                              <Image
                                src={listing.cover_image_url}
                                alt={listing.title ?? "Image annonce"}
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="text-muted-foreground flex h-full items-center justify-center text-[10px]">
                                N/A
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-medium hover:underline">
                              {listing?.title ?? "Annonce"}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {listing?.display_price?.toFixed(2) ?? "--.--"} € ·{" "}
                              {formatListingStatusLabel(listing?.status)}
                            </p>
                          </div>
                        </Link>
                        <form action={removeFavoriteListing}>
                          <input type="hidden" name="listing_id" value={row.listing_id} />
                          <Button
                            variant="secondary"
                            type="submit"
                            aria-label="Retirer des favoris"
                            title="Retirer des favoris"
                            className="h-8 min-w-12 gap-1 rounded-full px-2 text-xs transition-all duration-200 border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                          >
                            <Heart className="h-4 w-4 fill-current" />
                          </Button>
                        </form>
                      </div>
                    );
                  })()
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="searches">
          <div className="space-y-3">
            <h2 className="text-base font-semibold">Recherches sauvegardees</h2>
            {savedSearchesWithMeta.length > 0 ? (
              <SavedSearchesRealtimeListener totalNewMatches={totalNewMatches} />
            ) : null}
            {savedSearchesWithMeta.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Tu n&apos;as pas encore sauvegarde de recherche.
              </p>
            ) : (
              <div className="divide-border/60 divide-y">
                {savedSearchesWithMeta.map((row) => (
                  <SavedSearchItem
                    key={row.id}
                    id={row.id}
                    title={row.displayTitle}
                    createdAt={row.created_at}
                    criteria={row.criteria}
                    newMatchesCount={row.newMatchesCount}
                    relaunchHref={buildSearchHref(row.search_params)}
                    editHref={buildSearchEditorHref(row.search_params, row.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="sellers">
          <div className="flex flex-col gap-6">
            <CardHeader>
              <CardTitle>Vendeurs favoris</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {favoriteSellers.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Tu n&apos;as pas encore de vendeur favori.
                </p>
              ) : (
                favoriteSellers.map((row) => {
                  const d = row.display;
                  return (
                    <div
                      key={row.seller_id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <Link
                        href={`/u/${encodeURIComponent(d.username)}`}
                        className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-3 rounded-lg transition-colors"
                      >
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-muted">
                          {d.avatar_url ? (
                            <Image
                              src={d.avatar_url}
                              alt=""
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center text-lg font-medium text-muted-foreground">
                              {(d.username || "U").slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{d.username}</p>
                          <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                            <span
                              className="inline-flex gap-0.5 text-amber-500"
                              aria-label={`${Number(d.rating_avg)} sur 5`}
                            >
                              {[1, 2, 3, 4, 5].map((i) => (
                                <Star
                                  key={i}
                                  className={`size-4 shrink-0 ${i <= Math.round(Number(d.rating_avg)) ? "fill-amber-500" : "fill-transparent"}`}
                                />
                              ))}
                            </span>
                            <span className="text-xs">
                              {Number(d.review_count)} avis
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                      </Link>
                      <form action={removeFavoriteSeller} className="shrink-0">
                        <input type="hidden" name="seller_id" value={row.seller_id} />
                        <Button
                          type="submit"
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Retirer des favoris"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </form>
                    </div>
                  );
                })
              )}
            </CardContent>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
