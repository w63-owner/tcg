"use client";

import { useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { updateSavedSearchCriteria } from "@/app/favorites/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  setOptions: string[];
  savedSearchId?: string;
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
  setOptions,
  savedSearchId,
}: MarketplaceSearchPageFormProps) {
  const queryRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, []);

  const onUpdateSavedSearch = () => {
    if (!savedSearchId || !formRef.current) return;

    const formData = new FormData(formRef.current);
    const keys = [
      "q",
      "set",
      "condition",
      "is_graded",
      "grade_min",
      "grade_max",
      "price_min",
      "price_max",
      "sort",
    ] as const;
    const searchParams = Object.fromEntries(
      keys
        .map((key) => [key, String(formData.get(key) ?? "").trim()] as const)
        .filter(([, value]) => value.length > 0),
    );

    const payload = new FormData();
    payload.set("saved_search_id", savedSearchId);
    payload.set("search_params", JSON.stringify(searchParams));
    payload.set("name", String(formData.get("q") ?? "").trim());

    startTransition(async () => {
      const result = await updateSavedSearchCriteria(payload);
      if (!result?.ok) {
        toast.error("Impossible de mettre a jour la recherche sauvegardee.");
        return;
      }
      toast.success("Recherche sauvegardee mise a jour.");
    });
  };

  return (
    <form ref={formRef} action="/" className="grid gap-2">
      <Input
        ref={queryRef}
        name="q"
        defaultValue={query}
        placeholder="Rechercher une carte, un set, un vendeur..."
      />
      <select
        name="set"
        defaultValue={setFilter}
        className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        <option value="">Tous les sets</option>
        {setOptions.map((setId) => (
          <option key={setId} value={setId}>
            {setId}
          </option>
        ))}
      </select>
      <select
        name="condition"
        defaultValue={condition}
        className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        <option value="">Tous les etats</option>
        <option value="MINT">MINT</option>
        <option value="NEAR_MINT">NEAR_MINT</option>
        <option value="EXCELLENT">EXCELLENT</option>
        <option value="GOOD">GOOD</option>
        <option value="LIGHT_PLAYED">LIGHT_PLAYED</option>
        <option value="PLAYED">PLAYED</option>
        <option value="POOR">POOR</option>
      </select>
      <select
        name="is_graded"
        defaultValue={isGraded}
        className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        <option value="">Gradee + non gradee</option>
        <option value="1">Seulement gradees</option>
        <option value="0">Seulement non gradees</option>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <Input
          name="grade_min"
          defaultValue={gradeMin}
          placeholder="Note min"
          type="number"
          min="1"
          max="10"
          step="0.5"
        />
        <Input
          name="grade_max"
          defaultValue={gradeMax}
          placeholder="Note max"
          type="number"
          min="1"
          max="10"
          step="0.5"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          name="price_min"
          defaultValue={priceMin}
          placeholder="Prix min"
          type="number"
          min="0"
          step="0.01"
        />
        <Input
          name="price_max"
          defaultValue={priceMax}
          placeholder="Prix max"
          type="number"
          min="0"
          step="0.01"
        />
      </div>
      <select
        name="sort"
        defaultValue={sort}
        className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
      >
        <option value="date_desc">Plus recent</option>
        <option value="date_asc">Plus ancien</option>
        <option value="price_asc">Prix croissant</option>
        <option value="price_desc">Prix decroissant</option>
        <option value="grade_desc">Note decroissante</option>
        <option value="grade_asc">Note croissante</option>
      </select>
      <input type="hidden" name="page" value="1" />
      <Button type="submit" className="mt-1">
        Appliquer les filtres
      </Button>
      {savedSearchId ? (
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={onUpdateSavedSearch}
        >
          Mettre a jour cette recherche sauvegardee
        </Button>
      ) : null}
    </form>
  );
}
