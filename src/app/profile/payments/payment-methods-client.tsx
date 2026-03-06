"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listPaymentMethods,
  detachPaymentMethod,
  type PaymentMethodSummary,
} from "./actions";

function formatBrand(brand: string): string {
  const upper = brand.toUpperCase();
  if (upper === "VISA" || upper === "MASTERCARD" || upper === "AMEX") return upper;
  return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
}

export function PaymentMethodsClient() {
  const searchParams = useSearchParams();
  const justAdded = searchParams.get("added") === "1";
  const [cards, setCards] = useState<PaymentMethodSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const result = await listPaymentMethods();
    if (Array.isArray(result)) {
      setCards(result);
    } else {
      setCards([]);
      if (result.error) setError(result.error);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = async (id: string) => {
    setDeleting(true);
    const result = await detachPaymentMethod(id);
    setDeleting(false);
    if ("ok" in result && result.ok) {
      setCardToDelete(null);
      await load();
    } else {
      setError("error" in result ? result.error : "Erreur lors de la suppression.");
    }
  };

  const loading = cards === null;

  return (
    <div className="space-y-3">
      {justAdded && (
        <p className="bg-primary/10 text-primary rounded-lg px-3 py-2 text-sm">
          Carte enregistrée. Vous pourrez l&apos;utiliser lors de votre prochain paiement.
        </p>
      )}
      {loading ? (
        <div className="space-y-3">
          <div className="rounded-xl border p-4">
            <div className="space-y-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-48" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          </div>
        </div>
      ) : cards.length === 0 ? (
        <div className="space-y-3">
          <div className="rounded-xl border p-4">
            <div className="space-y-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-48" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          </div>
          <p className="text-muted-foreground text-center text-sm">
            Aucune carte enregistrée. Ajoutez une carte pour la réutiliser au checkout.
          </p>
          <Button asChild className="w-full">
            <Link href="/profile/payments/new">Ajouter une carte</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="divide-border/60 divide-y">
            {cards.map((card) => (
              <div key={card.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm">
                    {formatBrand(card.brand)} · **** {card.last4}
                  </p>
                  <p className="text-muted-foreground line-clamp-1 text-xs">
                    {card.holderName ?? "Carte"}{" "}
                    · Exp {String(card.expMonth).padStart(2, "0")}/{card.expYear}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCardToDelete(card.id)}
                  aria-label="Supprimer la carte"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button asChild className="w-full">
            <Link href="/profile/payments/new">Ajouter une carte</Link>
          </Button>
        </div>
      )}

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : null}

      <Dialog open={cardToDelete !== null} onOpenChange={(open) => !open && setCardToDelete(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Supprimer le moyen de paiement</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer ce moyen de paiement ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCardToDelete(null)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={() => cardToDelete && onDelete(cardToDelete)}
              disabled={deleting}
            >
              {deleting ? "Suppression…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
