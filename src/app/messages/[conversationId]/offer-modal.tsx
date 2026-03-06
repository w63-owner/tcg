"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitOfferFromConversationAction } from "@/app/messages/actions";

const MAX_DISCOUNT_PERCENT = 40;
const MIN_MULTIPLIER = 1 - MAX_DISCOUNT_PERCENT / 100;
const DAILY_OFFER_LIMIT = 10;

type OfferModalProps = {
  conversationId: string;
  listingId: string;
  listingTitle?: string;
  listingCoverUrl?: string;
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

type OfferPreset = "10" | "20" | "custom";

export function OfferModal({
  conversationId,
  listingId,
  listingTitle,
  listingCoverUrl,
  basePrice,
  canOffer,
  trigger,
}: OfferModalProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<OfferPreset | null>(null);
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

  const price10 = Math.round(basePrice * 0.9 * 100) / 100;
  const price20 = Math.round(basePrice * 0.8 * 100) / 100;

  const applyPreset = useCallback(
    (percent: 10 | 20) => {
      const multiplier = 1 - percent / 100;
      const value = Math.round(basePrice * multiplier * 100) / 100;
      setInputValue(value.toFixed(2));
      setSelectedPreset(String(percent) as "10" | "20");
      setValidationError(null);
    },
    [basePrice],
  );

  const selectCustom = useCallback(() => {
    setSelectedPreset("custom");
    setValidationError(null);
  }, []);

  const displayAmountFormatted = formatEuro(
    isValidNumber ? Math.round(numericValue * 100) / 100 : basePrice,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidNumber || exceedsMaxDiscount || isSubmitting) return;

    const amount = Math.round(numericValue * 100) / 100;
    const minAllowed = Math.round(basePrice * MIN_MULTIPLIER * 100) / 100;
    if (amount < minAllowed) {
      setValidationError(
        `Réduction maximale ${MAX_DISCOUNT_PERCENT} %. Montant minimum : ${formatEuro(minAllowed)}`,
      );
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
        setSelectedPreset(null);
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setValidationError(null);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" disabled={!canOffer} className="w-full">
            Faire une offre
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="grid w-full max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-md"
        showCloseButton={false}
      >
        {/* Header: X left, title centered */}
        <div className="relative flex items-center justify-center border-b px-4 py-3">
          <DialogClose
            className="text-muted-foreground hover:text-foreground absolute left-4 top-1/2 -translate-y-1/2 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            aria-label="Fermer"
          >
            <XIcon className="size-5" />
          </DialogClose>
          <DialogTitle className="text-center text-base font-semibold">
            Faire une offre
          </DialogTitle>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* Product info */}
          <div className="flex gap-3 border-b px-4 py-3">
            <div className="bg-muted relative h-14 w-12 shrink-0 overflow-hidden rounded-md border">
              {listingCoverUrl ? (
                <Image
                  src={listingCoverUrl}
                  alt={listingTitle ?? "Annonce"}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-foreground">
                {listingTitle ?? "Annonce"}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Prix de l&apos;article : {formatEuro(basePrice)}
              </p>
            </div>
          </div>

          {/* Offer options: 3 cards */}
          <div className="grid grid-cols-3 gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => applyPreset(10)}
              className={`flex flex-col items-center justify-center rounded-lg border-2 px-2 py-3 text-center transition-colors ${
                selectedPreset === "10"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:bg-muted/50"
              }`}
            >
              <span className="text-sm font-semibold">{formatEuro(price10)}</span>
              <span className="text-muted-foreground mt-0.5 text-xs">
                10% de réduction
              </span>
            </button>
            <button
              type="button"
              onClick={() => applyPreset(20)}
              className={`flex flex-col items-center justify-center rounded-lg border-2 px-2 py-3 text-center transition-colors ${
                selectedPreset === "20"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:bg-muted/50"
              }`}
            >
              <span className="text-sm font-semibold">{formatEuro(price20)}</span>
              <span className="text-muted-foreground mt-0.5 text-xs">
                20% de réduction
              </span>
            </button>
            <button
              type="button"
              onClick={selectCustom}
              className={`flex flex-col items-center justify-center rounded-lg border-2 px-2 py-3 text-center transition-colors ${
                selectedPreset === "custom"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:bg-muted/50"
              }`}
            >
              <span className="text-sm font-semibold">Autre</span>
              <span className="text-muted-foreground mt-0.5 text-xs">
                Propose un prix
              </span>
            </button>
          </div>

          {/* Custom input when "Autre" selected */}
          <div className="space-y-2 px-4 pb-2">
            {(selectedPreset === "custom" || !selectedPreset) && (
              <div className="space-y-1">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={basePrice.toFixed(2)}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setSelectedPreset("custom");
                    setValidationError(null);
                  }}
                  className="h-9 border-0 border-b rounded-none px-0 text-base focus-visible:ring-0"
                />
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              {displayAmountFormatted} incl. Protection acheteurs
            </p>
            {exceedsMaxDiscount && (
              <p className="text-destructive text-xs font-medium">
                Réduction maximale {MAX_DISCOUNT_PERCENT} %. Montant minimum :{" "}
                {formatEuro(
                  Math.round(basePrice * MIN_MULTIPLIER * 100) / 100,
                )}
              </p>
            )}
            {validationError && (
              <p className="text-destructive text-xs font-medium">
                {validationError}
              </p>
            )}
          </div>

          {/* Submit button */}
          <div className="px-4 pb-3">
            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={
                !isValidNumber || exceedsMaxDiscount || isSubmitting
              }
            >
              {isSubmitting
                ? "Envoi..."
                : `Proposer ${isValidNumber ? formatEuro(Math.round(numericValue * 100) / 100) : formatEuro(basePrice)}`}
            </Button>
          </div>

          {/* Footer: remaining offers */}
          <div className="border-t bg-muted/30 px-4 py-2">
            <p className="text-muted-foreground text-center text-xs">
              {DAILY_OFFER_LIMIT} proposition(s) restante(s) aujourd&apos;hui :{" "}
              <Link
                href="#"
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                Pourquoi ?
              </Link>
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
