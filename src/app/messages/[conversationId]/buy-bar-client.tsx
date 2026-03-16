"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startOfferCheckoutAction, cancelSentOfferAction } from "@/app/offers/actions";
import { useMessagesConversation } from "./messages-conversation-state";

type BuyBarClientProps = {
  isSeller: boolean;
  hasPaidTransaction: boolean;
  listingAlreadySold: boolean;
};

export function BuyBarClient({
  isSeller,
  hasPaidTransaction,
  listingAlreadySold,
}: BuyBarClientProps) {
  const { acceptedOfferId } = useMessagesConversation();
  const params = useParams<{ conversationId: string }>();

  if (!acceptedOfferId || isSeller || hasPaidTransaction || listingAlreadySold) {
    return null;
  }

  return (
    <div className="flex gap-2 py-2">
      <form action={startOfferCheckoutAction} className="flex-1">
        <input type="hidden" name="offer_id" value={acceptedOfferId} />
        <input type="hidden" name="return_conversation_id" value={params.conversationId} />
        <Button type="submit" className="w-full">Acheter</Button>
      </form>
      <form action={cancelSentOfferAction} className="flex-1">
        <input type="hidden" name="offer_id" value={acceptedOfferId} />
        <Button type="submit" variant="outline" className="w-full">
          Annuler mon offre
        </Button>
      </form>
    </div>
  );
}
