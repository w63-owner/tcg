"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";

type SavedSearchSummary = {
  id: string;
  title: string;
  href: string;
  criteria: string[];
};

type RecentSearchSummary = {
  title: string;
  href: string;
  criteria: string[];
};

type MarketplaceSearchPageFormProps = {
  query: string;
  setFilter: string;
  condition: string;
  isGraded: string;
  gradeMin: string;
  gradeMax: string;
  priceMin: string;
  priceMax: string;
  sort: string;
  savedSearches: SavedSearchSummary[];
};

export function MarketplaceSearchPageForm({
  query,
  setFilter,
  condition,
  isGraded,
  gradeMin,
  gradeMax,
  priceMin,
  priceMax,
  sort,
  savedSearches,
}: MarketplaceSearchPageFormProps) {
  const queryRef = useRef<HTMLInputElement | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearchSummary[]>([]);

  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, []);

  const currentSearch = useMemo<RecentSearchSummary | null>(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (setFilter) params.set("set", setFilter);
    if (condition) params.set("condition", condition);
    if (isGraded) params.set("is_graded", isGraded);
    if (gradeMin) params.set("grade_min", gradeMin);
    if (gradeMax) params.set("grade_max", gradeMax);
    if (priceMin) params.set("price_min", priceMin);
    if (priceMax) params.set("price_max", priceMax);
    if (sort && sort !== "date_desc") params.set("sort", sort);

    if (params.toString().length === 0) {
      return null;
    }

    const criteria: string[] = [];
    if (setFilter) criteria.push(setFilter);
    if (condition) criteria.push(condition);
    if (isGraded === "1") criteria.push("Gradee");
    if (isGraded === "0") criteria.push("Non gradee");
    if (gradeMin || gradeMax) criteria.push(`${gradeMin || "1"}-${gradeMax || "10"}`);
    if (priceMin || priceMax) criteria.push(`${priceMin || "0"}-${priceMax || "∞"} EUR`);
    if (sort && sort !== "date_desc") criteria.push(sort);

    return {
      title: query || "Recherche recente",
      href: `/?${params.toString()}`,
      criteria,
    };
  }, [
    condition,
    gradeMax,
    gradeMin,
    isGraded,
    priceMax,
    priceMin,
    query,
    setFilter,
    sort,
  ]);

  useEffect(() => {
    const STORAGE_KEY = "tcg_recent_searches";
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as RecentSearchSummary[]) : [];
      const normalized = Array.isArray(parsed) ? parsed : [];
      const deduped = normalized.filter(
        (item): item is RecentSearchSummary =>
          Boolean(item?.href && typeof item.href === "string" && item.title),
      );

      const merged = currentSearch
        ? [currentSearch, ...deduped.filter((item) => item.href !== currentSearch.href)]
        : deduped;
      const limited = merged.slice(0, 8);
      setRecentSearches(limited);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
    } catch {
      setRecentSearches(currentSearch ? [currentSearch] : []);
    }
  }, [currentSearch]);

  return (
    <form action="/" className="space-y-4">
      <Input
        ref={queryRef}
        name="q"
        defaultValue={query}
        placeholder="Rechercher une carte, un set, un vendeur..."
      />

      <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm font-medium">Mes recherches sauvegardees</p>
        {savedSearches.length === 0 ? (
          <p className="text-muted-foreground text-xs">Aucune recherche sauvegardee.</p>
        ) : (
          <div className="space-y-2">
            {savedSearches.map((savedSearch) => (
              <div key={savedSearch.id} className="space-y-1">
                <Link href={savedSearch.href} className="text-sm font-medium underline">
                  {savedSearch.title}
                </Link>
                {savedSearch.criteria.length > 0 ? (
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {savedSearch.criteria.map((criterion) => (
                      <Link
                        key={`${savedSearch.id}-${criterion}`}
                        href={savedSearch.href}
                        className="bg-muted text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[10px]"
                      >
                        {criterion}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm font-medium">Mes recherches recentes</p>
        {recentSearches.length === 0 ? (
          <p className="text-muted-foreground text-xs">Aucune recherche recente.</p>
        ) : (
          <div className="space-y-2">
            {recentSearches.map((search) => (
              <div key={search.href} className="space-y-1">
                <Link href={search.href} className="text-sm font-medium underline">
                  {search.title}
                </Link>
                {search.criteria.length > 0 ? (
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {search.criteria.map((criterion) => (
                      <Link
                        key={`${search.href}-${criterion}`}
                        href={search.href}
                        className="bg-muted text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[10px]"
                      >
                        {criterion}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}
