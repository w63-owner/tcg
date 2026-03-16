"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelSentOfferAction } from "@/app/offers/actions";

type CancelOfferFormProps = {
  offerId: string;
};

export function CancelOfferForm({ offerId }: CancelOfferFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    startTransition(async () => {
      await cancelSentOfferAction(formData);
      router.refresh();
    });
  };

  return (
    <form action={submit} className="w-full">
      <input type="hidden" name="offer_id" value={offerId} />
      <Button type="submit" variant="outline" className="w-full" disabled={isPending}>
        {isPending ? "Annulation..." : "Annuler mon offre"}
      </Button>
    </form>
  );
}
