"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HomeFilterBar } from "@/components/marketplace/home-filter-bar";
import { HomeAttributeFilters } from "@/components/marketplace/home-attribute-filters";

type MobileStickyHomeFiltersProps = {
  query: string;
  setFilter: string;
  rarity: string;
  condition: string;
  isGraded: string;
  gradeMin: string;
  gradeMax: string;
  priceMin: string;
  priceMax: string;
  sort: string;
  setOptions: string[];
  hasAnyFilter: boolean;
};

export function MobileStickyHomeFilters({
  query,
  setFilter,
  rarity,
  condition,
  isGraded,
  gradeMin,
  gradeMax,
  priceMin,
  priceMax,
  sort,
  setOptions,
  hasAnyFilter,
}: MobileStickyHomeFiltersProps) {
  const [hiddenOnScrollDown, setHiddenOnScrollDown] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;
      if (currentY <= 8) {
        setHiddenOnScrollDown(false);
      } else if (delta > 6) {
        setHiddenOnScrollDown(true);
      } else if (delta < -6) {
        setHiddenOnScrollDown(false);
      }
      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 bg-background md:hidden">
        <div className="mx-auto w-full max-w-7xl px-4 pt-3 pb-2">
          <HomeFilterBar
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
          />
        </div>
      </div>

      <div
        className={`fixed inset-x-0 top-[64px] z-30 bg-background transition-transform duration-200 md:hidden ${
          hiddenOnScrollDown ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="mx-auto w-full max-w-7xl space-y-2 px-4 pt-0 pb-1">
          <HomeAttributeFilters
            setOptions={setOptions}
            setFilter={setFilter}
            rarity={rarity}
            condition={condition}
            isGraded={isGraded}
            sort={sort}
            compact
          />
          {hasAnyFilter ? (
            <Link href="/" className="inline-flex text-xs underline">
              Reset all filters
            </Link>
          ) : null}
        </div>
      </div>
      <div
        className={`transition-[height] duration-200 md:hidden ${
          hiddenOnScrollDown ? "h-[36px]" : "h-[80px]"
        }`}
      />
    </>
  );
}

