"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Pencil, Settings2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removeSavedSearch, renameSavedSearch } from "./actions";

type SavedSearchItemProps = {
  id: string;
  title: string;
  createdAt: string;
  criteria: string[];
  newMatchesCount: number;
  relaunchHref: string;
  editHref: string;
};

export function SavedSearchItem({
  id,
  title,
  createdAt,
  criteria,
  newMatchesCount,
  relaunchHref,
  editHref,
}: SavedSearchItemProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);

  const onOpenSearch = () => {
    if (isRenaming || isPending) return;
    router.push(relaunchHref);
  };

  const onRename = () => {
    const nextName = nameDraft.trim();
    if (!nextName) {
      toast.error("Le nom ne peut pas etre vide.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("saved_search_id", id);
      formData.set("name", nextName);
      await renameSavedSearch(formData);
      setIsRenaming(false);
      toast.success("Recherche renommee.");
      router.refresh();
    });
  };

  const onRemove = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("saved_search_id", id);
      await removeSavedSearch(formData);
      toast.success("Recherche supprimee.");
      router.refresh();
    });
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpenSearch}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenSearch();
        }
      }}
      className="relative space-y-3 py-3 transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {newMatchesCount > 0 ? (
        <span className="bg-primary text-primary-foreground absolute top-2 right-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
          {newMatchesCount}
        </span>
      ) : null}

      <div className="min-w-0 space-y-1">
        <p className="line-clamp-1 text-sm font-medium">{title}</p>
        {criteria.length > 0 ? (
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {criteria.join(" · ")}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">Aucun critere additionnel.</p>
        )}
        <p className="text-muted-foreground text-xs">
          {new Date(createdAt).toLocaleDateString("fr-FR")}
        </p>
      </div>

      {isRenaming ? (
        <div
          className="flex items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            className="border-input h-8 w-full rounded-md border bg-transparent px-2 text-xs"
            autoFocus
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={isPending}
            onClick={onRename}
            aria-label="Confirmer le renommage"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={isPending}
            onClick={() => {
              setNameDraft(title);
              setIsRenaming(false);
            }}
            aria-label="Annuler le renommage"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          className="flex flex-wrap gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            asChild
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            aria-label="Modifier les filtres"
          >
            <Link href={editHref}>
              <Settings2 className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            aria-label="Renommer la recherche"
            onClick={() => setIsRenaming(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={isPending}
            aria-label="Supprimer la recherche"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
