"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { confirmReceiptAction, openDisputeAction } from "@/app/orders/receipt-actions";
import type { DisputeReason } from "@/app/orders/receipt-actions";

export type TrackingTransaction = {
  id: string;
  tracking_number: string | null;
  tracking_url: string | null;
  status: string;
};

type ReceiptActionClientProps = {
  transaction: TrackingTransaction;
};

const DISPUTE_REASONS: { value: DisputeReason; label: string }[] = [
  { value: "DAMAGED_CARD", label: "Carte abîmée" },
  { value: "WRONG_CARD", label: "Mauvaise carte" },
  { value: "EMPTY_PACKAGE", label: "Colis vide" },
  { value: "OTHER", label: "Autre" },
];

export function TrackingCard({ transaction }: ReceiptActionClientProps) {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Package className="h-4 w-4 shrink-0" />
          <span>En route</span>
        </div>
        {transaction.tracking_number ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Suivi :{" "}
            {transaction.tracking_url ? (
              <a
                href={transaction.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:no-underline"
              >
                {transaction.tracking_number}
              </a>
            ) : (
              <span className="font-mono">{transaction.tracking_number}</span>
            )}
          </p>
        ) : null}
        <Button
          type="button"
          className="mt-3 w-full"
          onClick={() => setModalOpen(true)}
        >
          Confirmer la réception
        </Button>
      </div>
      <ReceiptConfirmationModal
        transactionId={transaction.id}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}

type ReceiptConfirmationModalProps = {
  transactionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ReceiptConfirmationModal({
  transactionId,
  open,
  onOpenChange,
}: ReceiptConfirmationModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<"choice" | "yes" | "no">("choice");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [disputeReason, setDisputeReason] = useState<DisputeReason | "">("");
  const [disputeDescription, setDisputeDescription] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep("choice");
      setRating(0);
      setComment("");
      setDisputeReason("");
      setDisputeDescription("");
    }
    onOpenChange(nextOpen);
  };

  const handleChoice = (yes: boolean) => {
    setStep(yes ? "yes" : "no");
  };

  const handleConfirmReceipt = async () => {
    if (rating < 1 || rating > 5) {
      toast.error("Choisis une note entre 1 et 5.");
      return;
    }
    setIsPending(true);
    try {
      const result = await confirmReceiptAction(
        transactionId,
        rating,
        comment.trim() || null,
      );
      if (result.ok) {
        toast.success("Réception confirmée. Merci pour ton avis !");
        handleClose(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Une erreur est survenue.");
      }
    } catch {
      toast.error("Une erreur est survenue.");
    } finally {
      setIsPending(false);
    }
  };

  const handleOpenDispute = async () => {
    if (!disputeReason) {
      toast.error("Choisis un motif de litige.");
      return;
    }
    if (disputeDescription.trim().length < 10) {
      toast.error("Décris le problème (au moins 10 caractères).");
      return;
    }
    setIsPending(true);
    try {
      const result = await openDisputeAction(
        transactionId,
        disputeReason,
        disputeDescription.trim(),
      );
      if (result.ok) {
        toast.success("Litige enregistré. Le support va traiter ta demande.");
        handleClose(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Une erreur est survenue.");
      }
    } catch {
      toast.error("Une erreur est survenue.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "choice" && (
          <>
            <DialogHeader>
              <DialogTitle>Confirmer la réception</DialogTitle>
              <DialogDescription>
                La carte correspond-elle à l&apos;annonce ?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-row gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleChoice(false)}
              >
                Non, j&apos;ai un problème
              </Button>
              <Button type="button" onClick={() => handleChoice(true)}>
                Oui, tout est ok
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "yes" && (
          <>
            <DialogHeader>
              <DialogTitle>Évalue le vendeur</DialogTitle>
              <DialogDescription>
                Tu peux laisser une note (obligatoire) et un commentaire (optionnel).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <p className="mb-2 text-sm font-medium">Note (1 à 5)</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      className="rounded p-1 text-2xl text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      aria-label={`${value} étoile${value > 1 ? "s" : ""}`}
                    >
                      <Star
                        className={`h-8 w-8 ${
                          value <= rating
                            ? "fill-primary text-primary"
                            : ""
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="receipt-comment" className="mb-1 block text-sm font-medium">
                  Commentaire (optionnel)
                </label>
                <Textarea
                  id="receipt-comment"
                  placeholder="Ton avis sur la transaction..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("choice")}
                disabled={isPending}
              >
                Retour
              </Button>
              <Button
                type="button"
                onClick={handleConfirmReceipt}
                disabled={isPending || rating < 1}
              >
                {isPending ? "Envoi…" : "Confirmer et envoyer"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "no" && (
          <>
            <DialogHeader>
              <DialogTitle>Ouvrir un litige</DialogTitle>
              <DialogDescription>
                Décris le problème. Les fonds resteront bloqués jusqu&apos;à
                résolution par notre support.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label htmlFor="dispute-reason" className="mb-1 block text-sm font-medium">
                  Motif
                </label>
                <Select
                  value={disputeReason}
                  onValueChange={(v) => setDisputeReason(v as DisputeReason)}
                >
                  <SelectTrigger id="dispute-reason" className="w-full">
                    <SelectValue placeholder="Choisir un motif" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISPUTE_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="dispute-desc" className="mb-1 block text-sm font-medium">
                  Explications (min. 10 caractères)
                </label>
                <Textarea
                  id="dispute-desc"
                  placeholder="Décris ce qui ne va pas..."
                  value={disputeDescription}
                  onChange={(e) => setDisputeDescription(e.target.value)}
                  maxLength={5000}
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("choice")}
                disabled={isPending}
              >
                Retour
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleOpenDispute}
                disabled={
                  isPending ||
                  !disputeReason ||
                  disputeDescription.trim().length < 10
                }
              >
                {isPending ? "Envoi…" : "Ouvrir le litige"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
