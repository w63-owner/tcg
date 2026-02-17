"use client";

import { Bell } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { saveSearch } from "@/app/favorites/actions";
import { Button } from "@/components/ui/button";

type SaveSearchFloatingButtonProps = {
  currentSearchParams: string;
};

export function SaveSearchFloatingButton({
  currentSearchParams,
}: SaveSearchFloatingButtonProps) {
  const [isPending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("search_params", currentSearchParams);
      const result = await saveSearch(formData);
      if (!result?.ok) {
        const isAuthError = result?.error === "unauthorized";
        toast.error(
          isAuthError
            ? "Connecte-toi pour sauvegarder une recherche."
            : "Impossible de sauvegarder la recherche.",
        );
        return;
      }
      toast.success("Recherche sauvegardee.");
    });
  };

  return (
    <div className="fixed right-4 bottom-[calc(5.5rem+var(--safe-area-bottom))] z-40 md:hidden">
      <Button
        type="button"
        size="icon"
        aria-label="Sauvegarder cette recherche"
        className="h-12 w-12 rounded-full shadow-lg"
        disabled={isPending}
        onClick={onSave}
      >
        <Bell className="h-5 w-5" />
      </Button>
    </div>
  );
}
