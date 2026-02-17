import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import { fetchCardRefIdsByQuery } from "@/lib/listings/feed";
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

function describeSavedSearchCriteria(params: Record<string, string>) {
  const criteria: string[] = [];
  if (params.set) criteria.push(params.set);
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
  const condition = (params.condition ?? "").trim();
  const isGraded = (params.is_graded ?? "").trim();
  const gradeMin = parseOptionalNumber(params.grade_min);
  const gradeMax = parseOptionalNumber(params.grade_max);
  const priceMin = parseOptionalNumber(params.price_min);
  const priceMax = parseOptionalNumber(params.price_max);
  const queryCardRefIds = query ? await fetchCardRefIdsByQuery(supabase, query) : [];

  let cardRefIds: string[] | null = null;
  if (setFilter) {
    const { data: cardRefs } = await supabase
      .from("cards_ref")
      .select("id")
      .eq("set_id", setFilter)
      .limit(2000);
    cardRefIds = (cardRefs ?? []).map((card) => card.id);
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
  if (setFilter && cardRefIds) request = request.in("card_ref_id", cardRefIds);
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
  const favoriteSellers = (sellerRows ?? []) as FavoriteSellerRow[];
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
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Favoris</h1>
        <p className="text-muted-foreground text-sm">
          Retrouve tes annonces, recherches et vendeurs favoris.
        </p>
      </header>

      <Tabs defaultValue="listings">
        <TabsList className="grid w-full grid-cols-3">
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
              <div className="space-y-3">
                {favoriteListings.map((row) => (
                  (() => {
                    const listing = pickOne<ListingPreview>(row.listing);

                    return (
                      <div
                        key={row.listing_id}
                        className="flex items-center justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
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
                            <Link
                              href={`/listing/${row.listing_id}`}
                              className="line-clamp-1 text-sm font-medium hover:underline"
                            >
                              {listing?.title ?? "Annonce"}
                            </Link>
                            <p className="text-muted-foreground text-xs">
                              {listing?.display_price?.toFixed(2) ?? "--.--"} EUR ·{" "}
                              {listing?.status ?? "UNKNOWN"}
                            </p>
                          </div>
                        </div>
                        <form action={removeFavoriteListing}>
                          <input type="hidden" name="listing_id" value={row.listing_id} />
                          <Button size="sm" variant="outline" type="submit">
                            Retirer
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
              savedSearchesWithMeta.map((row) => (
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
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="sellers">
          <Card>
            <CardHeader>
              <CardTitle>Vendeurs favoris</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {favoriteSellers.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Tu n&apos;as pas encore de vendeur favori.
                </p>
              ) : (
                favoriteSellers.map((row) => (
                  (() => {
                    const seller = pickOne<FavoriteSeller>(row.seller);
                    return (
                      <div
                        key={row.seller_id}
                        className="flex items-center justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-medium">
                            {seller?.username ?? "Vendeur"}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Pays: {seller?.country_code ?? "--"}
                          </p>
                        </div>
                        <form action={removeFavoriteSeller}>
                          <input type="hidden" name="seller_id" value={row.seller_id} />
                          <Button size="sm" variant="outline" type="submit">
                            Retirer
                          </Button>
                        </form>
                      </div>
                    );
                  })()
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
