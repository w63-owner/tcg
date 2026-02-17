import Link from "next/link";
import { Button } from "@/components/ui/button";
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
  const savedSearchId = (params.saved_search_id ?? "").trim();

  const supabase = await createClient();
  const { data: setRows } = await supabase
    .from("cards_ref")
    .select("set_id")
    .order("set_id", { ascending: true })
    .limit(500);
  const setOptions = Array.from(
    new Set((setRows ?? []).map((row) => row.set_id).filter(Boolean)),
  );

  return (
    <section className="space-y-4">
      <SearchPageToast />
      <header className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
          <Link href="/">Retour au marketplace</Link>
        </Button>
        <h1 className="text-2xl font-semibold">Recherche</h1>
        <p className="text-muted-foreground text-sm">
          Ajuste tes filtres puis affiche les annonces du marketplace.
        </p>
      </header>

      <MarketplaceSearchPageForm
        query={query}
        setFilter={setFilter}
        condition={condition}
        isGraded={isGraded}
        gradeMin={gradeMin}
        gradeMax={gradeMax}
        priceMin={priceMin}
        priceMax={priceMax}
        sort={sort}
        setOptions={setOptions}
        savedSearchId={savedSearchId || undefined}
      />
    </section>
  );
}
