"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { formatConditionLabel } from "@/lib/listings/condition-label";

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
  const [queryValue, setQueryValue] = useState(query);
  const [recentSearches, setRecentSearches] = useState<RecentSearchSummary[]>([]);

  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, []);

  useEffect(() => {
    setQueryValue(query);
  }, [query]);

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
    if (condition) criteria.push(formatConditionLabel(condition));
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
      setRecentSearches(merged);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      setRecentSearches(currentSearch ? [currentSearch] : []);
    }
  }, [currentSearch]);

  const normalizedQuery = queryValue.trim().toLowerCase();
  const matchesQuery = (title: string, criteria: string[]) => {
    if (!normalizedQuery) return true;
    const haystack = `${title} ${criteria.join(" ")}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  };

  const filteredSavedSearches = useMemo(
    () =>
      savedSearches
        .filter((savedSearch) => matchesQuery(savedSearch.title, savedSearch.criteria))
        .slice(0, 2),
    [normalizedQuery, savedSearches],
  );

  const filteredRecentSearches = useMemo(
    () =>
      recentSearches.filter((search) =>
        matchesQuery(search.title, search.criteria),
      ),
    [normalizedQuery, recentSearches],
  );

  const suggestions = useMemo(() => {
    if (!normalizedQuery) return [] as string[];

    const fromHistory = [
      ...savedSearches.map((item) => item.title),
      ...recentSearches.map((item) => item.title),
      ...savedSearches.flatMap((item) => item.criteria),
      ...recentSearches.flatMap((item) => item.criteria),
    ];

    const generated = [
      `${queryValue} fr`,
      `${queryValue} near mint`,
      `${queryValue} set de base`,
      `${queryValue} holo`,
      `${queryValue} 10/102`,
    ];

    const unique = new Set<string>();
    for (const value of [...fromHistory, ...generated]) {
      const normalizedValue = String(value ?? "").trim();
      if (!normalizedValue) continue;
      const lower = normalizedValue.toLowerCase();
      if (lower === normalizedQuery) continue;
      if (!lower.includes(normalizedQuery) && !normalizedQuery.includes(lower)) continue;
      unique.add(normalizedValue);
      if (unique.size >= 8) break;
    }
    return Array.from(unique);
  }, [normalizedQuery, queryValue, recentSearches, savedSearches]);

  const showSavedSection = !normalizedQuery || filteredSavedSearches.length > 0;
  const showRecentSection = !normalizedQuery || filteredRecentSearches.length > 0;
  const showSuggestionsSection = Boolean(normalizedQuery && filteredSavedSearches.length === 0);

  return (
    <form action="/" className="space-y-4">
      <Input
        ref={queryRef}
        name="q"
        value={queryValue}
        onChange={(event) => setQueryValue(event.target.value)}
        placeholder="Rechercher une carte, un set, un vendeur..."
      />

      {showSavedSection ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Mes recherches sauvegardees</p>
          {filteredSavedSearches.length === 0 ? (
            <p className="text-muted-foreground text-xs">Aucune recherche sauvegardee.</p>
          ) : (
            <div className="space-y-2">
              {filteredSavedSearches.map((savedSearch) => (
                <div key={savedSearch.id} className="space-y-1">
                  <Link href={savedSearch.href} className="text-sm font-normal no-underline">
                    {savedSearch.title}
                  </Link>
                  {savedSearch.criteria.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
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
      ) : null}

      {showRecentSection ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Mes recherches recentes</p>
          {filteredRecentSearches.length === 0 ? (
            <p className="text-muted-foreground text-xs">Aucune recherche recente.</p>
          ) : (
            <div className="space-y-2">
              {filteredRecentSearches.map((search) => (
                <div key={search.href} className="space-y-1">
                  <Link href={search.href} className="text-sm font-normal no-underline">
                    {search.title}
                  </Link>
                  {search.criteria.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
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
      ) : null}

      {showSuggestionsSection ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Suggestions</p>
          {suggestions.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Essaie avec le set, la langue, l&apos;etat ou le numero (ex: 10/102).
            </p>
          ) : (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <div key={suggestion} className="space-y-1">
                  <Link
                    href={`/?q=${encodeURIComponent(suggestion)}`}
                    className="text-sm font-normal no-underline"
                  >
                    {suggestion}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </form>
  );
}
