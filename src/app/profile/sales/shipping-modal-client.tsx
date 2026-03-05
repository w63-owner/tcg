"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markAsShippedAction } from "./actions";

type ShippingModalTriggerProps = {
  transactionId: string;
};

export function ShippingModalTrigger({ transactionId }: ShippingModalTriggerProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await markAsShippedAction(transactionId, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Commande marquée comme expédiée. L'acheteur a été notifié.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Marquer comme expédié</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmer l&apos;expédition</DialogTitle>
          <DialogDescription>
            Indiquez éventuellement un numéro de suivi et un lien pour que l&apos;acheteur puisse suivre son colis.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            handleSubmit(formData);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="tracking_number">Numéro de suivi (optionnel)</Label>
            <Input
              id="tracking_number"
              name="tracking_number"
              placeholder="Ex. 1234567890"
              disabled={isPending}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tracking_url">URL de suivi (optionnel)</Label>
            <Input
              id="tracking_url"
              name="tracking_url"
              type="url"
              placeholder="https://..."
              disabled={isPending}
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Envoi en cours…" : "Valider l'expédition"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
