import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { FavoriteListingToggle } from "./favorite-listing-toggle";
import { calculateDisplayPrice } from "@/lib/pricing";
import { formatConditionLabel } from "@/lib/listings/condition-label";

type CardItemProps = {
  id: string;
  href?: string;
  title: string;
  coverImageUrl?: string | null;
  priceSeller: number;
  displayPrice?: number | null;
  condition?: string | null;
  isGraded: boolean;
  gradingCompany?: string | null;
  gradeNote?: number | null;
  language?: string | null;
  favoriteCount?: number;
  showFavoriteToggle?: boolean;
  initialFavorite?: boolean;
};

export function CardItem({
  id,
  href,
  title,
  coverImageUrl,
  priceSeller,
  displayPrice,
  condition,
  isGraded,
  gradingCompany,
  gradeNote,
  language,
  favoriteCount = 0,
  showFavoriteToggle = false,
  initialFavorite = false,
}: CardItemProps) {
  const finalDisplayPrice =
    typeof displayPrice === "number"
      ? displayPrice
      : calculateDisplayPrice(priceSeller);
  const listingHref = href ?? `/listing/${id}`;
  const gradeBadge = isGraded
    ? `${String(gradingCompany ?? "Graded").toUpperCase()}${gradeNote ? ` ${gradeNote}` : ""}`
    : formatConditionLabel(condition) || "Raw";
  const languageBadge = String(language ?? "").trim().toUpperCase();
  const hasLanguageBadge = ["FR", "EN", "JP"].includes(languageBadge);

  return (
    <article className="group flex h-full flex-col overflow-hidden py-0 transition-transform duration-200 hover:-translate-y-0.5">
      <Link href={listingHref} className="block">
        <div className="bg-muted aspect-[63/88] w-full">
          {coverImageUrl ? (
            <Image
              src={coverImageUrl}
              alt={title}
              width={480}
              height={640}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
              No image
            </div>
          )}
        </div>
      </Link>
      <section className="space-y-1 pt-1 pb-2">
        <Link href={listingHref} className="block truncate text-sm font-semibold">
          {title}
        </Link>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px]">
            {gradeBadge}
          </Badge>
          {hasLanguageBadge ? (
            <Badge variant="outline" className="text-[10px]">
              {languageBadge}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-1.5">
          <p className="text-sm font-normal tracking-tight">
            {finalDisplayPrice.toFixed(2)} €
          </p>
          <div className="flex items-center gap-1.5">
            {showFavoriteToggle ? (
              <FavoriteListingToggle
                listingId={id}
                initialLiked={initialFavorite}
                initialCount={favoriteCount}
              />
            ) : (
              <Badge variant="outline" className="h-8 min-w-8 justify-center rounded-full px-2">
                {favoriteCount}
              </Badge>
            )}
          </div>
        </div>
      </section>
    </article>
  );
}
