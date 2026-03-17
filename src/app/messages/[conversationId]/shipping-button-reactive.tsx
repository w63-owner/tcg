"use client";

import { useMemo } from "react";
import { useMessagesConversation, type SystemMessageMetadata } from "./messages-conversation-state";
import { ShippingModalTrigger } from "@/app/profile/sales/shipping-modal-client";

type ShippingButtonReactiveProps = {
  isSeller: boolean;
  serverTransactionId: string | null;
};

export function ShippingButtonReactive({
  isSeller,
  serverTransactionId,
}: ShippingButtonReactiveProps) {
  const { messages } = useMessagesConversation();

  const clientTransactionId = useMemo(() => {
    if (!isSeller) return null;
    let txId: string | null = null;
    for (const m of messages) {
      if (m.message_type !== "system") continue;
      const meta = m.metadata as SystemMessageMetadata | undefined;
      if (!meta?.type) continue;
      if (meta.type === "payment_completed" && meta.transaction_id) {
        txId = meta.transaction_id;
      } else if (meta.type === "order_shipped" || meta.type === "sale_completed") {
        txId = null;
      }
    }
    return txId;
  }, [isSeller, messages]);

  const transactionId = serverTransactionId ?? clientTransactionId;

  if (!isSeller || !transactionId) return null;

  return (
    <div className="py-2">
      <ShippingModalTrigger
        transactionId={transactionId}
        triggerClassName="w-full"
      />
    </div>
  );
}
