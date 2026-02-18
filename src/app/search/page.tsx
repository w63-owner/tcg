import { createClient } from "@/lib/supabase/server";
import { MarketplaceSearchPageForm } from "@/components/marketplace/search-page-form";
import { SearchPageToast } from "@/components/marketplace/search-page-toast";

type SearchParams = {
  q?: string;
  set?: string;
  condition?: string;
  is_graded?: string;
  grade_min?: string;
  grade_max?: string;
  price_min?: string;
  price_max?: string;
  sort?: string;
  saved_search_id?: string;
};

type SearchPageProps = {
  searchParams: Promise<SearchParams>;
};

type SavedSearchSummary = {
  id: string;
  title: string;
  href: string;
  criteria: string[];
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

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const setFilter = (params.set ?? "").trim();
  const condition = (params.condition ?? "").trim();
  const isGraded = (params.is_graded ?? "").trim();
  const gradeMin = (params.grade_min ?? "").trim();
  const gradeMax = (params.grade_max ?? "").trim();
  const priceMin = (params.price_min ?? "").trim();
  const priceMax = (params.price_max ?? "").trim();
  const sort = (params.sort ?? "date_desc").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let savedSearches: SavedSearchSummary[] = [];
  if (user) {
    const { data: savedRows } = await supabase
      .from("saved_searches")
      .select("id, name, search_params")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);

    savedSearches = (savedRows ?? []).map((row) => {
      const searchParamsRecord = (row.search_params ?? {}) as Record<string, string>;
      return {
        id: row.id as string,
        title:
          searchParamsRecord.q?.trim() || String((row.name as string | null | undefined) ?? "").trim() || "Recherche sauvegardee",
        href: buildSearchHref(searchParamsRecord),
        criteria: describeSavedSearchCriteria(searchParamsRecord),
      };
    });
  }

  return (
    <section className="space-y-4">
      <SearchPageToast />

      <MarketplaceSearchPageForm
        backHref="/"
        query={query}
        setFilter={setFilter}
        condition={condition}
        isGraded={isGraded}
        gradeMin={gradeMin}
        gradeMax={gradeMax}
        priceMin={priceMin}
        priceMax={priceMax}
        sort={sort}
        savedSearches={savedSearches}
      />
    </section>
  );
}
