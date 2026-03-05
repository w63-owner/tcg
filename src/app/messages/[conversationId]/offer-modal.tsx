"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
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
import { submitOfferFromConversationAction } from "@/app/messages/actions";

const MAX_DISCOUNT_PERCENT = 40;
const MIN_MULTIPLIER = 1 - MAX_DISCOUNT_PERCENT / 100;

type OfferModalProps = {
  conversationId: string;
  listingId: string;
  basePrice: number;
  canOffer: boolean;
  trigger?: React.ReactNode;
};

function formatEuro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function OfferModal({
  conversationId,
  listingId,
  basePrice,
  canOffer,
  trigger,
}: OfferModalProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const numericValue = parseFloat(inputValue.replace(",", "."));
  const isValidNumber = Number.isFinite(numericValue) && numericValue > 0;
  const discountPercent =
    isValidNumber && basePrice > 0
      ? Math.round((1 - numericValue / basePrice) * 100)
      : null;
  const exceedsMaxDiscount =
    isValidNumber &&
    basePrice > 0 &&
    numericValue < Math.round(basePrice * MIN_MULTIPLIER * 100) / 100;

  const applyPreset = useCallback(
    (percent: number) => {
      const multiplier = 1 - percent / 100;
      const value = Math.round(basePrice * multiplier * 100) / 100;
      setInputValue(value.toFixed(2));
      setValidationError(null);
    },
    [basePrice],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidNumber || exceedsMaxDiscount || isSubmitting) return;

    const amount = Math.round(numericValue * 100) / 100;
    const minAllowed = Math.round(basePrice * MIN_MULTIPLIER * 100) / 100;
    if (amount < minAllowed) {
      setValidationError(`Réduction maximale ${MAX_DISCOUNT_PERCENT} %. Montant minimum : ${formatEuro(minAllowed)}`);
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);
    try {
      const result = await submitOfferFromConversationAction(
        conversationId,
        listingId,
        amount,
      );
      if (result.ok) {
        setOpen(false);
        setInputValue("");
        toast.success("Offre envoyée, en attente du vendeur.");
      } else {
        setValidationError(result.error ?? "Erreur lors de l'envoi.");
        toast.error(result.error);
      }
    } catch {
      setValidationError("Erreur réseau.");
      toast.error("Erreur réseau.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setValidationError(null); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" disabled={!canOffer} className="w-full">
            Faire une offre
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Faire une offre</DialogTitle>
          <DialogDescription>
            Prix de l&apos;annonce : {formatEuro(basePrice)}. Réduction maximale {MAX_DISCOUNT_PERCENT} %.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-muted-foreground text-sm font-medium">
              Votre offre (€)
            </label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder={basePrice.toFixed(2)}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setValidationError(null);
              }}
              className="text-base"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => applyPreset(5)}
              >
                -5 %
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => applyPreset(10)}
              >
                -10 %
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => applyPreset(20)}
              >
                -20 %
              </Button>
            </div>
            {isValidNumber && discountPercent !== null && (
              <p className="text-muted-foreground text-xs">
                Soit une réduction de {discountPercent} % par rapport au prix de base.
              </p>
            )}
            {exceedsMaxDiscount && (
              <p className="text-destructive text-xs font-medium">
                Réduction maximale {MAX_DISCOUNT_PERCENT} %. Montant minimum :{" "}
                {formatEuro(Math.round(basePrice * MIN_MULTIPLIER * 100) / 100)}
              </p>
            )}
            {validationError && (
              <p className="text-destructive text-xs font-medium">{validationError}</p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={
              !isValidNumber || exceedsMaxDiscount || isSubmitting
            }
          >
            {isSubmitting ? "Envoi..." : "Valider"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
