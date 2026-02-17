import Link from "next/link";
import { Button } from "@/components/ui/button";

type PaginationControlsProps = {
  currentPage: number;
  prevHref: string;
  nextHref: string;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevLabel?: string;
  nextLabel?: string;
};

export function PaginationControls({
  currentPage,
  prevHref,
  nextHref,
  hasPrevPage,
  hasNextPage,
  prevLabel = "Page precedente",
  nextLabel = "Page suivante",
}: PaginationControlsProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      {hasPrevPage ? (
        <Button asChild variant="outline" size="sm">
          <Link href={prevHref}>{prevLabel}</Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          {prevLabel}
        </Button>
      )}
      <p className="text-muted-foreground text-sm">Page {currentPage}</p>
      {hasNextPage ? (
        <Button asChild variant="outline" size="sm">
          <Link href={nextHref}>{nextLabel}</Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          {nextLabel}
        </Button>
      )}
    </div>
  );
}
