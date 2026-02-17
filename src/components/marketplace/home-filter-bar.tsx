"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatConditionLabel } from "@/lib/listings/condition-label";

type HomeFilterBarProps = {
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
};

function FilterFields({
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
}: HomeFilterBarProps) {
  return (
    <>
      <Input
        name="q"
        defaultValue={query}
        placeholder="Nom de la carte, numero (ex : Dracaufeu 4/102)"
        className="xl:col-span-2"
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
        <option value="MINT">{formatConditionLabel("MINT")}</option>
        <option value="NEAR_MINT">{formatConditionLabel("NEAR_MINT")}</option>
        <option value="EXCELLENT">{formatConditionLabel("EXCELLENT")}</option>
        <option value="GOOD">{formatConditionLabel("GOOD")}</option>
        <option value="LIGHT_PLAYED">{formatConditionLabel("LIGHT_PLAYED")}</option>
        <option value="PLAYED">{formatConditionLabel("PLAYED")}</option>
        <option value="POOR">{formatConditionLabel("POOR")}</option>
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
      <Input name="grade_min" defaultValue={gradeMin} placeholder="Note min" type="number" min="1" max="10" step="0.5" />
      <Input name="grade_max" defaultValue={gradeMax} placeholder="Note max" type="number" min="1" max="10" step="0.5" />
      <Input name="price_min" defaultValue={priceMin} placeholder="Prix min" type="number" min="0" step="0.01" />
      <Input name="price_max" defaultValue={priceMax} placeholder="Prix max" type="number" min="0" step="0.01" />
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
    </>
  );
}

export function HomeFilterBar(props: HomeFilterBarProps) {
  const triggerHrefParams = new URLSearchParams();
  if (props.query) triggerHrefParams.set("q", props.query);
  if (props.setFilter) triggerHrefParams.set("set", props.setFilter);
  if (props.condition) triggerHrefParams.set("condition", props.condition);
  if (props.isGraded) triggerHrefParams.set("is_graded", props.isGraded);
  if (props.gradeMin) triggerHrefParams.set("grade_min", props.gradeMin);
  if (props.gradeMax) triggerHrefParams.set("grade_max", props.gradeMax);
  if (props.priceMin) triggerHrefParams.set("price_min", props.priceMin);
  if (props.priceMax) triggerHrefParams.set("price_max", props.priceMax);
  if (props.sort && props.sort !== "date_desc") triggerHrefParams.set("sort", props.sort);
  const triggerHref = triggerHrefParams.toString()
    ? `/search?${triggerHrefParams.toString()}`
    : "/search";

  return (
    <div className="space-y-2">
      <div className="md:hidden">
        <Link
          href={triggerHref}
          aria-label="Ouvrir la recherche et les filtres"
          className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none md:text-sm"
        >
          <Search className="text-muted-foreground h-4 w-4 shrink-0" />
          {props.query || "Nom de la carte, numero (ex : Dracaufeu 4/102)"}
        </Link>
      </div>

      <form className="hidden gap-2 md:grid md:grid-cols-2 xl:grid-cols-4">
        <FilterFields {...props} />
        <input type="hidden" name="page" value="1" />
        <Button type="submit">Rechercher</Button>
      </form>
    </div>
  );
}
