"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";

type FavoriteListingToggleProps = {
  listingId: string;
  initialLiked: boolean;
};

export function FavoriteListingToggle({
  listingId,
  initialLiked,
}: FavoriteListingToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [liked, setLiked] = useState(initialLiked);

  const onToggle = () => {
    startTransition(async () => {
      const previousState = liked;
      const nextState = !liked;
      setLiked(nextState);
      try {
        const response = await fetch("/api/favorites/listings/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        const json = (await response.json()) as { liked?: boolean; error?: string };
        if (!response.ok || typeof json.liked !== "boolean") {
          setLiked(previousState);
          toast.error(json.error ?? "Impossible de mettre a jour le favori.");
          return;
        }
        setLiked(json.liked);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(10);
        }
        toast.success(
          json.liked
            ? "Annonce ajoutee aux favoris."
            : "Annonce retiree des favoris.",
        );
      } catch {
        setLiked(previousState);
        toast.error("Erreur reseau. Reessaye.");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      aria-label={liked ? "Retirer des favoris" : "Ajouter aux favoris"}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 ${
        liked
          ? "border-red-500/50 bg-red-500/10 text-red-600 shadow-sm"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
    </button>
  );
}
