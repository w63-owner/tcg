import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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
  gradeNote?: number | null;
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
  gradeNote,
  favoriteCount = 0,
  showFavoriteToggle = false,
  initialFavorite = false,
}: CardItemProps) {
  const finalDisplayPrice =
    typeof displayPrice === "number"
      ? displayPrice
      : calculateDisplayPrice(priceSeller);
  const listingHref = href ?? `/listing/${id}`;

  return (
    <Card className="group overflow-hidden py-0 transition-transform duration-200 hover:-translate-y-0.5">
      <Link href={listingHref} className="block">
        <div className="bg-muted aspect-[3/4] w-full">
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
      <CardContent className="space-y-2 p-3">
        <Link href={listingHref} className="line-clamp-2 text-sm font-semibold">
          {title}
        </Link>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">
            {isGraded ? "Graded" : formatConditionLabel(condition) || "Raw"}
          </Badge>
          {isGraded && gradeNote ? <Badge variant="outline">Note {gradeNote}</Badge> : null}
        </div>
      </CardContent>
      <CardFooter className="flex items-end justify-between gap-2 px-3 pb-3">
        <div>
          <p className="text-xl font-semibold tracking-tight">
            {finalDisplayPrice.toFixed(2)} EUR
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {showFavoriteToggle ? (
            <FavoriteListingToggle
              listingId={id}
              initialLiked={initialFavorite}
              initialCount={favoriteCount}
            />
          ) : (
            <span className="text-muted-foreground inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs">
              {favoriteCount}
            </span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
