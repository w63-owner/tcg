"use client";

import { Heart, Share2 } from "lucide-react";
import { toast } from "sonner";
import { FavoriteListingToggle } from "@/components/marketplace/favorite-listing-toggle";
import { Button } from "@/components/ui/button";

type ListingMediaActionsProps = {
  listingId: string;
  title: string;
  favoriteCount: number;
  initialFavorite: boolean;
  canToggleFavorite: boolean;
};

export function ListingMediaActions({
  listingId,
  title,
  favoriteCount,
  initialFavorite,
  canToggleFavorite,
}: ListingMediaActionsProps) {
  const onShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text: title, url });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copie.");
        return;
      }
      toast.error("Partage non disponible sur cet appareil.");
    } catch {
      // Ignore user-initiated cancellation from native share sheet.
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2"
        onClick={() => void onShare()}
      >
        <Share2 className="h-3.5 w-3.5" />
        Partager
      </Button>
      {canToggleFavorite ? (
        <FavoriteListingToggle
          listingId={listingId}
          initialLiked={initialFavorite}
          initialCount={favoriteCount}
        />
      ) : (
        <span className="text-muted-foreground inline-flex h-8 min-w-12 items-center justify-center gap-1 rounded-full border px-2 text-xs">
          <Heart className="h-4 w-4" />
          <span>{favoriteCount}</span>
        </span>
      )}
    </div>
  );
}

