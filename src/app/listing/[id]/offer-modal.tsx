"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitOfferAction } from "./actions";
import { initialOfferActionState } from "./offer-action-state";

type OfferModalProps = {
  listingId: string;
  defaultOfferAmount: number;
  canOffer: boolean;
};

export function OfferModal({
  listingId,
  defaultOfferAmount,
  canOffer,
}: OfferModalProps) {
  const [state, formAction, isPending] = useActionState(
    submitOfferAction,
    initialOfferActionState,
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!canOffer} className="w-full">
          Faire une offre
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Faire une offre</DialogTitle>
          <DialogDescription>
            Les offres inferieures a 70% du prix affiche sont automatiquement
            refusees.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="listing_id" value={listingId} />
          <Input
            name="offer_amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={defaultOfferAmount.toFixed(2)}
            required
          />
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Envoi..." : "Envoyer mon offre"}
          </Button>
        </form>

        {state.status !== "idle" ? (
          <p
            className={`text-sm ${
              state.status === "success" ? "text-primary" : "text-destructive"
            }`}
          >
            {state.message}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
