import { createClient } from "@/lib/supabase/server";
import { saveSearch } from "@/app/favorites/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { HomeFilterBar } from "@/components/marketplace/home-filter-bar";
import { SaveSearchFloatingButton } from "@/components/marketplace/save-search-floating-button";
import { InfiniteListingsFeed } from "@/components/marketplace/infinite-listings-feed";
import { PullToRefresh } from "@/components/marketplace/pull-to-refresh";
import { HomeAttributeFilters } from "@/components/marketplace/home-attribute-filters";
import { fetchListingsFeedPage, fetchSetOptions, parseFeedFilters } from "@/lib/listings/feed";

type HomeProps = {
  searchParams: Promise<{
    q?: string;
    set?: string;
    rarity?: string;
    condition?: string;
    is_graded?: string;
    grade_min?: string;
    grade_max?: string;
    price_min?: string;
    price_max?: string;
    sort?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const filters = parseFeedFilters({
    q: params.q,
    set: params.set,
    rarity: params.rarity,
    condition: params.condition,
    is_graded: params.is_graded,
    grade_min: params.grade_min,
    grade_max: params.grade_max,
    price_min: params.price_min,
    price_max: params.price_max,
    sort: params.sort,
  });
  const query = filters.q;
  const setFilter = filters.set;
  const rarity = filters.rarity;
  const condition = filters.condition;
  const isGraded = filters.is_graded;
  const gradeMin = filters.grade_min;
  const gradeMax = filters.grade_max;
  const priceMin = filters.price_min;
  const priceMax = filters.price_max;
  const sort = filters.sort;
  const pageSize = 40;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [favoriteRowsResult, setOptions, feedResult] = await Promise.all([
    user
      ? supabase
          .from("favorite_listings")
          .select("listing_id")
          .eq("user_id", user.id)
      : Promise.resolve({ data: [] as Array<{ listing_id: string }> }),
    fetchSetOptions(supabase),
    fetchListingsFeedPage({
      supabase,
      filters,
      page: 1,
      pageSize,
    }),
  ]);
  const favoriteListingIds = new Set(
    (favoriteRowsResult.data ?? []).map((row) => row.listing_id),
  );
  const listings = feedResult.listings;
  const hasNextPage = feedResult.hasNextPage;
  const error = feedResult.error ? { message: feedResult.error } : null;

  const currentSearchParams = JSON.stringify({
    q: query || undefined,
    set: setFilter || undefined,
    rarity: rarity || undefined,
    condition: condition || undefined,
    is_graded: isGraded || undefined,
    grade_min: gradeMin !== null ? String(gradeMin) : undefined,
    grade_max: gradeMax !== null ? String(gradeMax) : undefined,
    price_min: priceMin !== null ? String(priceMin) : undefined,
    price_max: priceMax !== null ? String(priceMax) : undefined,
    sort: sort || undefined,
  });
  const backHref = `/?${new URLSearchParams(
    Object.entries({
      q: query || undefined,
      set: setFilter || undefined,
      rarity: rarity || undefined,
      condition: condition || undefined,
      is_graded: isGraded || undefined,
      grade_min: gradeMin !== null ? String(gradeMin) : undefined,
      grade_max: gradeMax !== null ? String(gradeMax) : undefined,
      price_min: priceMin !== null ? String(priceMin) : undefined,
      price_max: priceMax !== null ? String(priceMax) : undefined,
      sort: sort || undefined,
    }).filter(([, value]) => typeof value === "string") as Array<
      [string, string]
    >,
  ).toString()}`;

  const baseParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => typeof value === "string"),
  ) as Record<string, string>;
  delete baseParams.page;

  const buildHref = (
    updates: Partial<Record<string, string>>,
    removedKeys: string[] = [],
  ) => {
    const draft = { ...baseParams };
    removedKeys.forEach((key) => delete draft[key]);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value?.trim()) {
        delete draft[key];
      } else {
        draft[key] = value;
      }
    });
    const qs = new URLSearchParams(draft).toString();
    return qs ? `/?${qs}` : "/";
  };
  const buildEditorHref = (
    updates: Partial<Record<string, string>>,
    removedKeys: string[] = [],
  ) => {
    const draft = { ...baseParams };
    removedKeys.forEach((key) => delete draft[key]);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value?.trim()) {
        delete draft[key];
      } else {
        draft[key] = value;
      }
    });
    const qs = new URLSearchParams(draft).toString();
    return qs ? `/search?${qs}` : "/search";
  };

  const hasAnyFilter = Boolean(
    query ||
      setFilter ||
      rarity ||
      condition ||
      isGraded ||
      gradeMin !== null ||
      gradeMax !== null ||
      priceMin !== null ||
      priceMax !== null ||
      (sort && sort !== "date_desc"),
  );

  return (
    <section className="space-y-4">
      <PullToRefresh />
      <header className="space-y-3">
        <HomeFilterBar
          query={query}
          setFilter={setFilter}
          condition={condition}
          isGraded={isGraded}
          gradeMin={gradeMin !== null ? String(gradeMin) : ""}
          gradeMax={gradeMax !== null ? String(gradeMax) : ""}
          priceMin={priceMin !== null ? String(priceMin) : ""}
          priceMax={priceMax !== null ? String(priceMax) : ""}
          sort={sort}
          setOptions={setOptions}
        />
        <div className="space-y-2">
          <HomeAttributeFilters
            setOptions={setOptions}
            setFilter={setFilter}
            rarity={rarity}
            condition={condition}
            isGraded={isGraded}
            sort={sort}
          />
          {hasAnyFilter ? (
            <Link href="/" className="inline-flex text-xs underline">
              Reset all filters
            </Link>
          ) : null}
        </div>
        {user ? (
          <form
            action={async (formData) => {
              "use server";
              await saveSearch(formData);
            }}
            className="hidden flex-wrap gap-2 md:flex"
          >
            <Input
              name="name"
              placeholder="Nom de cette recherche"
            />
            <input type="hidden" name="search_params" value={currentSearchParams} />
            <Button size="sm" type="submit" variant="outline">
              Sauvegarder cette recherche
            </Button>
          </form>
        ) : null}
      </header>

      <h2 className="text-lg font-semibold">Nouveautes</h2>

      {error ? (
        <div className="border-destructive/40 bg-destructive/10 rounded-md border p-3 text-sm">
          Impossible de charger le feed: {error.message}
        </div>
      ) : null}

      {listings.length === 0 ? (
        <div className="text-muted-foreground rounded-md border p-6 text-center text-sm">
          {query
            ? "Aucun resultat pour cette recherche."
            : "Aucune annonce active pour le moment."}
        </div>
      ) : (
        <InfiniteListingsFeed
          initialListings={listings}
          initialFavoriteListingIds={listings
            .filter((listing) => favoriteListingIds.has(listing.id))
            .map((listing) => listing.id)}
          initialHasNextPage={hasNextPage}
          filters={{
            q: query || undefined,
            set: setFilter || undefined,
            rarity: rarity || undefined,
            condition: condition || undefined,
            is_graded: isGraded || undefined,
            grade_min: gradeMin !== null ? String(gradeMin) : undefined,
            grade_max: gradeMax !== null ? String(gradeMax) : undefined,
            price_min: priceMin !== null ? String(priceMin) : undefined,
            price_max: priceMax !== null ? String(priceMax) : undefined,
            sort: sort || undefined,
          }}
          showFavoriteToggle={Boolean(user)}
          fromHref={backHref || "/"}
        />
      )}

      {user && hasAnyFilter ? (
        <SaveSearchFloatingButton currentSearchParams={currentSearchParams} />
      ) : null}
    </section>
  );
}
