"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { deleteListingAction } from "@/app/listing/[id]/actions";

type DeleteListingButtonProps = {
  listingId: string;
  className?: string;
};

export function DeleteListingButton({ listingId, className }: DeleteListingButtonProps) {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const confirmed = window.confirm(
      "Supprimer cette annonce ? Cette action est definitive et ne peut pas etre annulee.",
    );
    if (!confirmed) {
      event.preventDefault();
    }
  };

  return (
    <form action={deleteListingAction} onSubmit={onSubmit}>
      <input type="hidden" name="listing_id" value={listingId} />
      <Button type="submit" variant="destructive" className={className ?? "h-12 w-full"}>
        Supprimer
      </Button>
    </form>
  );
}
