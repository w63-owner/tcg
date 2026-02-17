"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
      <select
        value={setFilter}
        onChange={(event) =>
          updateParam("set", event.target.value, new URLSearchParams(searchParams), router, pathname)
        }
        className="border-input h-9 shrink-0 rounded-md border bg-transparent px-2 text-sm"
      >
        <option value="">Serie: Toutes</option>
        {setOptions.map((setId) => (
          <option key={setId} value={setId}>
            {`Serie: ${setId}`}
          </option>
        ))}
      </select>

      <select
        value={rarity}
        onChange={(event) =>
          updateParam("rarity", event.target.value, new URLSearchParams(searchParams), router, pathname)
        }
        className="border-input h-9 shrink-0 rounded-md border bg-transparent px-2 text-sm"
      >
        {rarityOptions.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {`Rarete: ${option.label}`}
          </option>
        ))}
      </select>

      <select
        value={condition}
        onChange={(event) =>
          updateParam(
            "condition",
            event.target.value,
            new URLSearchParams(searchParams),
            router,
            pathname,
          )
        }
        className="border-input h-9 shrink-0 rounded-md border bg-transparent px-2 text-sm"
      >
        {conditionOptions.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {`Etat: ${option.label}`}
          </option>
        ))}
      </select>

      <select
        value={isGraded}
        onChange={(event) =>
          updateParam(
            "is_graded",
            event.target.value,
            new URLSearchParams(searchParams),
            router,
            pathname,
          )
        }
        className="border-input h-9 shrink-0 rounded-md border bg-transparent px-2 text-sm"
      >
        {gradedOptions.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {`Gradation: ${option.label}`}
          </option>
        ))}
      </select>

      <select
        value={sort || "date_desc"}
        onChange={(event) =>
          updateParam("sort", event.target.value, new URLSearchParams(searchParams), router, pathname)
        }
        className="border-input h-9 shrink-0 rounded-md border bg-transparent px-2 text-sm"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {`Tri: ${option.label}`}
          </option>
        ))}
      </select>
    </div>
  );
}

