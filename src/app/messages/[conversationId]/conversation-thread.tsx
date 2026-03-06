"use client";

import { useEffect, useMemo, useRef } from "react";
import { Banknote, CheckCircle2, Package, Handshake, XCircle } from "lucide-react";
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
  buyerUsername?: string | null;
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

function formatEuro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const SYSTEM_MSG_CLASS =
  "max-w-[85%] rounded-md border border-amber-200 px-3 py-2.5 text-center text-sm text-muted-foreground [background:oklch(0.97_0.015_85)] dark:[background:oklch(0.22_0.03_85)] dark:border-amber-800";

export function ConversationThread({
  messages,
  currentUserId,
  sellerId,
  buyerUsername = null,
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
                <div className={`flex flex-col items-center gap-1.5 ${SYSTEM_MSG_CLASS}`}>
                  {(() => {
                    try {
                      const data = JSON.parse(message.content) as {
                        type?: string;
                        offer_amount?: number;
                        total_amount?: number;
                        seller_credit?: number;
                      };
                      const isSeller = currentUserId === sellerId;
                      if (data.type === "offer_accepted" && typeof data.offer_amount === "number") {
                        const amount = formatEuro(data.offer_amount);
                        if (isSeller) {
                          const buyerName = buyerUsername ?? "l'acheteur";
                          return (
                            <>
                              <Handshake className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
                              <p className="font-semibold text-foreground">Offre acceptée</p>
                              <p className="mt-0">
                                Vous avez accepté l&apos;offre de {amount}. Nous vous informerons
                                quand {buyerName} aura procédé au paiement.
                              </p>
                            </>
                          );
                        }
                        return (
                          <>
                            <Handshake className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
                            <p className="font-semibold text-foreground">Offre acceptée</p>
                            <p className="mt-0">
                              Le vendeur a accepté votre offre de {amount}. Vous pouvez désormais
                              procéder au paiement.
                            </p>
                          </>
                        );
                      }
                      if (data.type === "payment_completed" && typeof data.total_amount === "number") {
                        const amount = formatEuro(data.total_amount);
                        if (isSeller) {
                          return (
                            <>
                              <Banknote className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
                              <p className="font-semibold text-foreground">Paiement effectué</p>
                              <p className="mt-0">
                                L&apos;acheteur a effectué le paiement de {amount}. Tu peux procéder
                                à l&apos;envoi de l&apos;article.
                              </p>
                            </>
                          );
                        }
                        return (
                          <>
                            <Banknote className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
                            <p className="font-semibold text-foreground">Paiement effectué</p>
                            <p className="mt-0">
                              Paiement effectué ({amount}). Le vendeur va t&apos;envoyer
                              l&apos;article.
                            </p>
                          </>
                        );
                      }
                      if (data.type === "order_shipped") {
                        if (isSeller) {
                          return (
                            <>
                              <Package className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
                              <p className="font-semibold text-foreground">Commande expédiée</p>
                              <p className="mt-0">
                                Vous avez marqué cette commande comme expédiée. L&apos;acheteur a été
                                invité à confirmer la réception à réception du colis.
                              </p>
                            </>
                          );
                        }
                        return (
                          <>
                            <Package className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
                            <p className="font-semibold text-foreground">Commande expédiée</p>
                            <p className="mt-0">
                              La commande a bien été expédiée. Merci de confirmer la réception de la
                              commande à réception de celle-ci.
                            </p>
                          </>
                        );
                      }
                      if (data.type === "sale_completed") {
                        const sellerCredit =
                          typeof data.seller_credit === "number" ? data.seller_credit : 0;
                        if (isSeller) {
                          return (
                            <>
                              <CheckCircle2 className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
                              <p className="font-semibold text-foreground">Vente terminée</p>
                              <p className="mt-0">
                                La vente est terminée. Ton solde a été crédité de{" "}
                                {formatEuro(sellerCredit)} (montant de la vente).
                              </p>
                            </>
                          );
                        }
                        return (
                          <>
                            <CheckCircle2 className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
                            <p className="font-semibold text-foreground">Vente terminée</p>
                            <p className="mt-0">La vente est terminée. Merci pour ta confiance.</p>
                          </>
                        );
                      }
                    } catch {
                      /* not JSON, fallback to legacy display */
                    }
                    const parts = message.content.split("\n\n");
                    if (parts.length >= 2) {
                      return (
                        <>
                          <p className="font-semibold text-foreground">{parts[0]}</p>
                          <p className="mt-0">{parts.slice(1).join("\n\n")}</p>
                        </>
                      );
                    }
                    return <p>{message.content}</p>;
                  })()}
                </div>
              </div>
            ) : (
            <>
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
                    className={`max-w-[85%] rounded-lg border px-3 py-2.5 text-sm ${
                      isMine ? "bg-primary/10" : "bg-muted/40"
                    }`}
                  >
                    <p>{message.content}</p>
                  </div>
                )}
              </div>
              {offer && (offer.status === "ACCEPTED" || offer.status === "REJECTED") ? (
                <div className="flex justify-center">
                  <div className={`flex flex-col items-center gap-1.5 ${SYSTEM_MSG_CLASS}`}>
                    {offer.status === "ACCEPTED" ? (
                      <>
                        <Handshake className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
                        <p className="font-semibold text-foreground">Offre acceptée</p>
                        <p className="mt-0">
                          {isSeller
                            ? `Vous avez accepté l'offre de ${formatEuro(offer.offer_amount)}. Nous vous informerons quand ${buyerUsername ?? "l'acheteur"} aura procédé au paiement.`
                            : `Le vendeur a accepté votre offre de ${formatEuro(offer.offer_amount)}. Vous pouvez désormais procéder au paiement.`}
                        </p>
                      </>
                    ) : (
                      <>
                        <XCircle className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
                        <p className="font-semibold text-foreground">Offre refusée</p>
                        <p className="mt-0">
                          {isSeller
                            ? "Vous avez refusé cette offre."
                            : "Le vendeur a refusé votre offre."}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
