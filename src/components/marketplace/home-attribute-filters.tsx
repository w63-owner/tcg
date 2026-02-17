"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type HomeAttributeFiltersProps = {
  setOptions: string[];
  setFilter: string;
  rarity: string;
  condition: string;
  isGraded: string;
  sort: string;
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
}: HomeAttributeFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  return (
    <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1">
      <Select
        value={setFilter || ALL_OPTION}
        onValueChange={(value) =>
          updateParam(
            "set",
            value === ALL_OPTION ? "" : value,
            new URLSearchParams(searchParams),
            router,
            pathname,
          )
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[10rem] shrink-0">
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
          updateParam(
            "rarity",
            value === ALL_OPTION ? "" : value,
            new URLSearchParams(searchParams),
            router,
            pathname,
          )
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[10rem] shrink-0">
          <SelectValue placeholder="Rarete: Toutes raretes" />
        </SelectTrigger>
        <SelectContent>
          {rarityOptions.map((option) => (
            <SelectItem key={option.value || ALL_OPTION} value={option.value || ALL_OPTION}>
              {`Rarete: ${option.label}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition || ALL_OPTION}
        onValueChange={(value) =>
          updateParam(
            "condition",
            value === ALL_OPTION ? "" : value,
            new URLSearchParams(searchParams),
            router,
            pathname,
          )
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[10rem] shrink-0">
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

      <Select
        value={isGraded || ALL_OPTION}
        onValueChange={(value) =>
          updateParam(
            "is_graded",
            value === ALL_OPTION ? "" : value,
            new URLSearchParams(searchParams),
            router,
            pathname,
          )
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[10rem] shrink-0">
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

      <Select
        value={sort || "date_desc"}
        onValueChange={(value) =>
          updateParam("sort", value, new URLSearchParams(searchParams), router, pathname)
        }
      >
        <SelectTrigger className="h-9 w-auto min-w-[10rem] shrink-0">
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
  );
}

