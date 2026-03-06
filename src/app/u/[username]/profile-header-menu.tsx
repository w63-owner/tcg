"use client";

import { useCallback } from "react";
import { MoreVertical, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ProfileHeaderMenuProps = { username: string };

export function ProfileHeaderMenu({ username }: ProfileHeaderMenuProps) {
  const getProfileUrl = () =>
    typeof window !== "undefined" ? `${window.location.origin}/u/${encodeURIComponent(username)}` : "";

  const shareProfile = useCallback(() => {
    const url = getProfileUrl();
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator
        .share({
          title: `Profil ${username}`,
          url,
          text: `Voir le profil de ${username} sur la marketplace`,
        })
        .then(() => toast.success("Lien partagé"))
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name !== "AbortError") copyUrl();
        });
    } else {
      copyUrl();
    }
  }, [username]);

  function copyUrl() {
    const url = getProfileUrl();
    if (typeof navigator === "undefined" || !url) return;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Lien copié dans le presse-papier"),
      () => toast.error("Impossible de copier le lien"),
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Menu profil">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="end">
        <button
          type="button"
          onClick={shareProfile}
          className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm"
        >
          <Share2 className="h-4 w-4" />
          Partager le profil
        </button>
      </PopoverContent>
    </Popover>
  );
}
