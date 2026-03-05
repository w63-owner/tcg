"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { respondToOfferAction } from "@/app/offers/actions";

type AcceptOfferFormProps = {
  offerId: string;
};

export function AcceptOfferForm({ offerId }: AcceptOfferFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await respondToOfferAction(formData);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="offer_id" value={offerId} />
      <input type="hidden" name="decision" value="ACCEPTED" />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "En cours..." : "Accepter"}
      </Button>
    </form>
  );
}
