import { createClient } from "@/lib/supabase/server";
import { saveSearch } from "@/app/favorites/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { HomeFilterBar } from "@/components/marketplace/home-filter-bar";
import { SaveSearchFloatingButton } from "@/components/marketplace/save-search-floating-button";
import { InfiniteListingsFeed } from "@/components/marketplace/infinite-listings-feed";
import { fetchListingsFeedPage, fetchSetOptions, parseFeedFilters } from "@/lib/listings/feed";

type HomeProps = {
  searchParams: Promise<{
    q?: string;
    set?: string;
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

  const activeFilters: Array<{ key: string; label: string; href: string }> = [];
  const withFilterRemoved = (key: string) => {
    const draft = Object.fromEntries(
      Object.entries(params).filter(([, value]) => typeof value === "string"),
    ) as Record<string, string>;
    delete draft[key];
    delete draft.page;
    const qs = new URLSearchParams(draft).toString();
    return qs ? `/?${qs}` : "/";
  };
  const withFiltersRemoved = (keys: string[]) => {
    const draft = Object.fromEntries(
      Object.entries(params).filter(([, value]) => typeof value === "string"),
    ) as Record<string, string>;
    keys.forEach((key) => delete draft[key]);
    delete draft.page;
    const qs = new URLSearchParams(draft).toString();
    return qs ? `/?${qs}` : "/";
  };
  if (query) activeFilters.push({ key: "q", label: `Recherche: ${query}`, href: withFilterRemoved("q") });
  if (setFilter) activeFilters.push({ key: "set", label: `Set: ${setFilter}`, href: withFilterRemoved("set") });
  if (condition) {
    activeFilters.push({
      key: "condition",
      label: `Etat: ${condition}`,
      href: withFilterRemoved("condition"),
    });
  }
  if (isGraded === "1" || isGraded === "0") {
    activeFilters.push({
      key: "is_graded",
      label: isGraded === "1" ? "Gradee" : "Non gradee",
      href: withFilterRemoved("is_graded"),
    });
  }
  if (priceMin !== null || priceMax !== null) {
    activeFilters.push({
      key: "price",
      label: `Prix: ${priceMin !== null ? priceMin : 0}-${priceMax !== null ? priceMax : "∞"}`,
      href: withFiltersRemoved(["price_min", "price_max"]),
    });
  }
  if (gradeMin !== null || gradeMax !== null) {
    activeFilters.push({
      key: "grade",
      label: `Note: ${gradeMin !== null ? gradeMin : 1}-${gradeMax !== null ? gradeMax : 10}`,
      href: withFiltersRemoved(["grade_min", "grade_max"]),
    });
  }
  if (sort && sort !== "date_desc") {
    activeFilters.push({ key: "sort", label: `Tri: ${sort}`, href: withFilterRemoved("sort") });
  }

  return (
    <section className="space-y-4">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">Marketplace Pokemon</h1>
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
        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <Link
                key={filter.key}
                href={filter.href}
                className="rounded-full border px-3 py-1 text-xs"
              >
                {filter.label} ×
              </Link>
            ))}
            <Link href="/" className="text-xs underline">
              Reset all filters
            </Link>
          </div>
        ) : null}
        {user ? (
          <form action={saveSearch} className="hidden flex-wrap gap-2 md:flex">
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

      {user && activeFilters.length > 0 ? (
        <SaveSearchFloatingButton currentSearchParams={currentSearchParams} />
      ) : null}
    </section>
  );
}
