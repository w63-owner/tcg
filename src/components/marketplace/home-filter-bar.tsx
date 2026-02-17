"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const ALL_OPTION = "__all__";

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
  const [setValue, setSetValue] = useState(setFilter);
  const [conditionValue, setConditionValue] = useState(condition);
  const [gradedValue, setGradedValue] = useState(isGraded);
  const [sortValue, setSortValue] = useState(sort || "date_desc");

  return (
    <>
      <Input
        name="q"
        defaultValue={query}
        placeholder="Nom de la carte, numero (ex : Dracaufeu 4/102)"
        className="xl:col-span-2"
      />
      <input type="hidden" name="set" value={setValue} />
      <Select
        value={setValue || ALL_OPTION}
        onValueChange={(value) => setSetValue(value === ALL_OPTION ? "" : value)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Tous les sets" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_OPTION}>Tous les sets</SelectItem>
          {setOptions.map((setId) => (
            <SelectItem key={setId} value={setId}>
              {setId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <input type="hidden" name="condition" value={conditionValue} />
      <Select
        value={conditionValue || ALL_OPTION}
        onValueChange={(value) => setConditionValue(value === ALL_OPTION ? "" : value)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Tous les etats" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_OPTION}>Tous les etats</SelectItem>
          <SelectItem value="MINT">{formatConditionLabel("MINT")}</SelectItem>
          <SelectItem value="NEAR_MINT">{formatConditionLabel("NEAR_MINT")}</SelectItem>
          <SelectItem value="EXCELLENT">{formatConditionLabel("EXCELLENT")}</SelectItem>
          <SelectItem value="GOOD">{formatConditionLabel("GOOD")}</SelectItem>
          <SelectItem value="LIGHT_PLAYED">{formatConditionLabel("LIGHT_PLAYED")}</SelectItem>
          <SelectItem value="PLAYED">{formatConditionLabel("PLAYED")}</SelectItem>
          <SelectItem value="POOR">{formatConditionLabel("POOR")}</SelectItem>
        </SelectContent>
      </Select>

      <input type="hidden" name="is_graded" value={gradedValue} />
      <Select
        value={gradedValue || ALL_OPTION}
        onValueChange={(value) => setGradedValue(value === ALL_OPTION ? "" : value)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Gradee + non gradee" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_OPTION}>Gradee + non gradee</SelectItem>
          <SelectItem value="1">Seulement gradees</SelectItem>
          <SelectItem value="0">Seulement non gradees</SelectItem>
        </SelectContent>
      </Select>
      <Input name="grade_min" defaultValue={gradeMin} placeholder="Note min" type="number" min="1" max="10" step="0.5" />
      <Input name="grade_max" defaultValue={gradeMax} placeholder="Note max" type="number" min="1" max="10" step="0.5" />
      <Input name="price_min" defaultValue={priceMin} placeholder="Prix min" type="number" min="0" step="0.01" />
      <Input name="price_max" defaultValue={priceMax} placeholder="Prix max" type="number" min="0" step="0.01" />
      <input type="hidden" name="sort" value={sortValue} />
      <Select value={sortValue} onValueChange={setSortValue}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Tri" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date_desc">Plus recent</SelectItem>
          <SelectItem value="date_asc">Plus ancien</SelectItem>
          <SelectItem value="price_asc">Prix croissant</SelectItem>
          <SelectItem value="price_desc">Prix decroissant</SelectItem>
          <SelectItem value="grade_desc">Note decroissante</SelectItem>
          <SelectItem value="grade_asc">Note croissante</SelectItem>
        </SelectContent>
      </Select>
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
        <Button
          asChild
          variant="outline"
          className="h-9 w-full justify-start px-3 text-sm font-normal shadow-none"
        >
          <Link href={triggerHref} aria-label="Ouvrir la recherche et les filtres">
            <Search className="text-muted-foreground h-4 w-4 shrink-0" />
            {props.query || "Nom de la carte, numero (ex : Dracaufeu 4/102)"}
          </Link>
        </Button>
      </div>

      <form className="hidden gap-2 md:grid md:grid-cols-2 xl:grid-cols-4">
        <FilterFields
          key={`${props.setFilter}|${props.condition}|${props.isGraded}|${props.sort}`}
          {...props}
        />
        <input type="hidden" name="page" value="1" />
        <Button type="submit">Rechercher</Button>
      </form>
    </div>
  );
}
