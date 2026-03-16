"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { respondToOfferAction } from "@/app/offers/actions";
import { useMessagesConversation } from "./messages-conversation-state";

type AcceptOfferFormProps = {
  offerId: string;
};

export function AcceptOfferForm({ offerId }: AcceptOfferFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { updateOfferStatus } = useMessagesConversation();

  const submit = (formData: FormData) => {
    const decision = String(formData.get("decision") ?? "").trim() as
      | "ACCEPTED"
      | "REJECTED";
    if (decision !== "ACCEPTED" && decision !== "REJECTED") return;
    startTransition(async () => {
      await respondToOfferAction(formData);
      updateOfferStatus(offerId, decision);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <form action={submit}>
        <input type="hidden" name="offer_id" value={offerId} />
        <input type="hidden" name="decision" value="ACCEPTED" />
        <Button type="submit" size="sm" variant="default" disabled={isPending}>
          {isPending ? "En cours..." : "Accepter"}
        </Button>
      </form>
      <form action={submit}>
        <input type="hidden" name="offer_id" value={offerId} />
        <input type="hidden" name="decision" value="REJECTED" />
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          Décliner
        </Button>
      </form>
    </div>
  );
}
