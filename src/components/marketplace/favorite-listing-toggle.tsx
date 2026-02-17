"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type FavoriteListingToggleProps = {
  listingId: string;
  initialLiked: boolean;
  initialCount: number;
};

export function FavoriteListingToggle({
  listingId,
  initialLiked,
  initialCount,
}: FavoriteListingToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(Math.max(0, initialCount));

  const onToggle = () => {
    startTransition(async () => {
      const previousState = liked;
      const previousCount = count;
      const nextState = !liked;
      setLiked(nextState);
      setCount((current) => Math.max(0, current + (nextState ? 1 : -1)));
      try {
        const response = await fetch("/api/favorites/listings/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        const json = (await response.json()) as { liked?: boolean; error?: string };
        if (!response.ok || typeof json.liked !== "boolean") {
          setLiked(previousState);
          setCount(previousCount);
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
        setCount(previousCount);
        toast.error("Erreur reseau. Reessaye.");
      }
    });
  };

  return (
    <Button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      aria-label={liked ? "Retirer des favoris" : "Ajouter aux favoris"}
      variant={liked ? "secondary" : "outline"}
      className={`h-8 min-w-12 gap-1 rounded-full px-2 text-xs transition-all duration-200 ${
        liked
          ? "border-primary/40 bg-primary/10 text-primary"
          : "text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
      }`}
    >
      <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
      <span>{count}</span>
    </Button>
  );
}
