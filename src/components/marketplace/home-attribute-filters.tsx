"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HomeAttributeFiltersProps = {
  setOptions: string[];
  setFilter: string;
  rarity: string;
  condition: string;
  isGraded: string;
  sort: string;
  compact?: boolean;
};

type Option = {
  value: string;
  label: string;
};

const ALL_OPTION = "__all__";

function updateParam(
  key: string,
  value: string,
  searchParams: URLSearchParams,
  router: ReturnType<typeof useRouter>,
  pathname: string,
) {
  const next = new URLSearchParams(searchParams);
  next.delete("page");
  if (!value.trim()) {
    next.delete(key);
  } else {
    next.set(key, value);
  }
  const query = next.toString();
  router.push(query ? `${pathname}?${query}` : pathname);
}

export function HomeAttributeFilters({
  setOptions,
  setFilter,
  rarity,
  condition,
  isGraded,
  sort,
  compact = false,
}: HomeAttributeFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(!compact);

  const conditionOptions: Option[] = [
    { value: "", label: "Tous les etats" },
    { value: "MINT", label: "Mint" },
    { value: "NEAR_MINT", label: "Near mint" },
    { value: "EXCELLENT", label: "Excellent" },
    { value: "GOOD", label: "Good" },
    { value: "LIGHT_PLAYED", label: "Light played" },
    { value: "PLAYED", label: "Played" },
    { value: "POOR", label: "Poor" },
  ];

  const rarityOptions: Option[] = [
    { value: "", label: "Toutes raretes" },
    { value: "COMMON", label: "Commune" },
    { value: "UNCOMMON", label: "Peu commune" },
    { value: "RARE", label: "Rare" },
    { value: "HOLO_RARE", label: "Rare holo" },
    { value: "ULTRA_RARE", label: "Ultra rare" },
    { value: "PROMO", label: "Promo" },
    { value: "SIR", label: "SIR" },
    { value: "IR", label: "IR" },
  ];

  const gradedOptions: Option[] = [
    { value: "", label: "Toutes cartes" },
    { value: "1", label: "Gradees" },
    { value: "0", label: "Non gradees" },
  ];

  const sortOptions: Option[] = [
    { value: "date_desc", label: "Plus recent" },
    { value: "price_asc", label: "Prix croissant" },
    { value: "price_desc", label: "Prix decroissant" },
    { value: "grade_desc", label: "Note decroissante" },
  ];

  const isSetActive = Boolean(setFilter);
  const isRarityActive = Boolean(rarity);
  const isConditionActive = Boolean(condition);
  const isGradedActive = Boolean(isGraded);
  const isSortActive = sort && sort !== "date_desc";

  const triggerClass = (active: boolean) =>
    cn(
      "h-10 w-auto min-w-[10rem] shrink-0",
      active && "border-primary/40 bg-primary/10 text-primary",
    );

  const handleParamChange = (key: string, value: string) => {
    startTransition(() => {
      updateParam(key, value, new URLSearchParams(searchParams), router, pathname);
    });
  };

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const storageKey = "home-attribute-filters-scroll-left";
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      rail.scrollLeft = Number(saved) || 0;
    }

    const updateFade = () => {
      const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
      setCanScrollRight(remaining > 4);
    };
    const onScroll = () => {
      sessionStorage.setItem(storageKey, String(rail.scrollLeft));
      updateFade();
    };

    updateFade();
    rail.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateFade);
    return () => {
      rail.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateFade);
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative">
        <div ref={railRef} className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
          <Select
            value={setFilter || ALL_OPTION}
            onValueChange={(value) => handleParamChange("set", value === ALL_OPTION ? "" : value)}
          >
            <SelectTrigger className={triggerClass(isSetActive)}>
              <SelectValue placeholder="Serie: Toutes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OPTION}>Serie: Toutes</SelectItem>
              {setOptions.map((setId) => (
                <SelectItem key={setId} value={setId}>
                  {`Serie: ${setId}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={rarity || ALL_OPTION}
            onValueChange={(value) =>
              handleParamChange("rarity", value === ALL_OPTION ? "" : value)
            }
          >
            <SelectTrigger className={triggerClass(isRarityActive)}>
              <SelectValue placeholder="Toutes raretes" />
            </SelectTrigger>
            <SelectContent>
              {rarityOptions.map((option) => (
                <SelectItem key={option.value || ALL_OPTION} value={option.value || ALL_OPTION}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={condition || ALL_OPTION}
            onValueChange={(value) =>
              handleParamChange("condition", value === ALL_OPTION ? "" : value)
            }
          >
            <SelectTrigger className={triggerClass(isConditionActive)}>
              <SelectValue placeholder="Etat: Tous les etats" />
            </SelectTrigger>
            <SelectContent>
              {conditionOptions.map((option) => (
                <SelectItem key={option.value || ALL_OPTION} value={option.value || ALL_OPTION}>
                  {`Etat: ${option.label}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {compact ? (
            <Button
              type="button"
              variant={showMoreFilters || isGradedActive ? "secondary" : "outline"}
              className="h-10 shrink-0"
              onClick={() => setShowMoreFilters((prev) => !prev)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Plus de filtres
            </Button>
          ) : (
            <Select
              value={isGraded || ALL_OPTION}
              onValueChange={(value) =>
                handleParamChange("is_graded", value === ALL_OPTION ? "" : value)
              }
            >
              <SelectTrigger className={triggerClass(isGradedActive)}>
                <SelectValue placeholder="Gradation: Toutes cartes" />
              </SelectTrigger>
              <SelectContent>
                {gradedOptions.map((option) => (
                  <SelectItem key={option.value || ALL_OPTION} value={option.value || ALL_OPTION}>
                    {`Gradation: ${option.label}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={sort || "date_desc"}
            onValueChange={(value) => handleParamChange("sort", value)}
          >
            <SelectTrigger className={triggerClass(Boolean(isSortActive))}>
              <SelectValue placeholder="Tri: Plus recent" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {`Tri: ${option.label}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div
          className={cn(
            "pointer-events-none absolute top-0 right-0 h-10 w-10 bg-gradient-to-l from-background to-transparent transition-opacity",
            canScrollRight ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      {compact && showMoreFilters ? (
        <div className="flex gap-2">
          <Select
            value={isGraded || ALL_OPTION}
            onValueChange={(value) =>
              handleParamChange("is_graded", value === ALL_OPTION ? "" : value)
            }
          >
            <SelectTrigger className={cn("h-10 w-auto min-w-[10rem] shrink-0", triggerClass(isGradedActive))}>
              <SelectValue placeholder="Gradation: Toutes cartes" />
            </SelectTrigger>
            <SelectContent>
              {gradedOptions.map((option) => (
                <SelectItem key={option.value || ALL_OPTION} value={option.value || ALL_OPTION}>
                  {`Gradation: ${option.label}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {isPending ? (
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Mise a jour...
        </p>
      ) : null}
    </div>
  );
}

