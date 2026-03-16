"use client";

import type { ReactNode } from "react";
import { useMessagesConversation } from "./messages-conversation-state";

export function OfferBarClient({ children }: { children: ReactNode }) {
  const { acceptedOfferId } = useMessagesConversation();
  if (acceptedOfferId) return null;
  return <>{children}</>;
}
