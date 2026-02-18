"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadPaymentCards, savePaymentCards, type PaymentCard } from "./payment-storage";

export function PaymentMethodsClient() {
  const [cards, setCards] = useState<PaymentCard[]>([]);

  useEffect(() => {
    setCards(loadPaymentCards());
  }, []);

  const persist = (nextCards: PaymentCard[]) => {
    setCards(nextCards);
    savePaymentCards(nextCards);
  };

  const onDelete = (id: string) => {
    persist(cards.filter((card) => card.id !== id));
  };

  return (
    <div className="space-y-3">
      {cards.length === 0 ? (
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
          <p className="text-muted-foreground text-center text-sm">Aucune carte enregistrée.</p>
          <Button asChild className="w-full">
            <Link href="/profile/payments/new">Ajouter</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="divide-border/60 divide-y">
            {cards.map((card) => (
              <div key={card.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm">
                    {card.brand} - **** **** **** {card.last4}
                  </p>
                  {card.holderName || (card.expMonth && card.expYear) ? (
                    <p className="text-muted-foreground line-clamp-1 text-xs">
                      {card.holderName ?? "Titulaire"}{" "}
                      {card.expMonth && card.expYear ? `· Exp ${card.expMonth}/${card.expYear.slice(-2)}` : ""}
                    </p>
                  ) : null}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onDelete(card.id)}>
                  Supprimer
                </Button>
              </div>
            ))}
          </div>
          <Button asChild className="w-full">
            <Link href="/profile/payments/new">Ajouter</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
