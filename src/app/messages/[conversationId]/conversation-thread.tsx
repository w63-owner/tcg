"use client";

import { useEffect, useMemo, useRef } from "react";
import { AcceptOfferForm } from "./accept-offer-form";

type OfferData = {
  id: string;
  offer_amount: number;
  status: string;
  buyer_id: string;
  listing_id: string;
};

type ThreadMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  message_type?: string | null;
  offer_id?: string | null;
  offer?: OfferData | OfferData[] | null;
};

type ConversationThreadProps = {
  messages: ThreadMessage[];
  currentUserId: string;
  sellerId: string;
};

function toDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown-day";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function ConversationThread({
  messages,
  currentUserId,
  sellerId,
}: ConversationThreadProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const rows = useMemo(() => {
    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const showDaySeparator =
        index === 0 || toDayKey(previous.created_at) !== toDayKey(message.created_at);
      return { message, showDaySeparator };
    });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="text-muted-foreground m-auto rounded-md border px-4 py-2 text-sm">
        Commence la conversation.
      </div>
    );
  }

  return (
    <div ref={viewportRef} className="flex h-full flex-col gap-3 overflow-y-auto">
      {rows.map(({ message, showDaySeparator }) => {
        const isMine = message.sender_id === currentUserId;
        const offer = message.message_type === "offer" ? pickOne(message.offer) : null;
        const isSeller = currentUserId === sellerId;
        const canAcceptOffer = offer && offer.status === "PENDING" && isSeller;

        return (
          <div key={message.id} className="space-y-2">
            {showDaySeparator ? (
              <div className="flex items-center justify-center">
                <span className="bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]">
                  {formatDayLabel(message.created_at)}
                </span>
              </div>
            ) : null}
            {message.message_type === "system" ? (
              <div className="flex justify-center">
                <div className="bg-muted/60 text-muted-foreground max-w-[85%] rounded-md border border-amber-200 px-3 py-2 text-center text-sm dark:border-amber-800">
                  <p>{message.content}</p>
                </div>
              </div>
            ) : (
            <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              {offer ? (
                <div
                  className={`max-w-[85%] rounded-lg border px-3 py-2.5 text-sm ${
                    isMine ? "bg-primary/10" : "bg-muted/40"
                  }`}
                >
                  <p className="font-medium">
                    Offre : {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(offer.offer_amount)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs capitalize">
                    {offer.status === "PENDING" && "En attente"}
                    {offer.status === "ACCEPTED" && "Acceptée"}
                    {offer.status === "REJECTED" && "Refusée"}
                    {offer.status === "EXPIRED" && "Expirée"}
                    {offer.status === "CANCELLED" && "Annulée"}
                  </p>
                  {canAcceptOffer ? (
                    <div className="mt-2">
                      <AcceptOfferForm offerId={offer.id} />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div
                  className={`max-w-[85%] rounded-md border px-3 py-2 text-sm ${
                    isMine ? "bg-primary/10" : "bg-muted/40"
                  }`}
                >
                  <p>{message.content}</p>
                </div>
              )}
            </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
