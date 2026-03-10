"use client";

import type { ImageMessageMetadata, SystemMessageMetadata } from "../types";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Banknote, Check, CheckCircle2, CheckCheck, Loader2, Package, Handshake, XCircle } from "lucide-react";
import { AcceptOfferForm } from "./accept-offer-form";
import { useMessagesConversation } from "./messages-conversation-state";
import { fetchOlderMessages, markMessagesAsReadAction } from "../actions";
import type { ThreadMessage } from "./messages-conversation-state";

type OfferData = {
  id: string;
  offer_amount: number;
  status: string;
  buyer_id: string;
  listing_id: string;
};

type ConversationThreadProps = {
  messages: ThreadMessage[];
  currentUserId: string;
  sellerId: string;
  buyerUsername?: string | null;
  conversationId: string;
  counterpartName?: string | null;
};

const READ_RECEIPT_BATCH_MS = 150;
const TWO_MINUTES_MS = 2 * 60 * 1000;

function useReadReceiptBatcher(conversationId: string) {
  const { updateMessageReadAt } = useMessagesConversation();
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markedRef = useRef<Set<string>>(new Set());

  const flush = useCallback(() => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
    const ids = Array.from(pendingRef.current);
    pendingRef.current.clear();
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    ids.forEach((id) => updateMessageReadAt(id, now));
    void markMessagesAsReadAction(conversationId, ids);
  }, [conversationId, updateMessageReadAt]);

  const markAsReadWhenVisible = useCallback(
    (messageId: string) => {
      if (markedRef.current.has(messageId)) return;
      markedRef.current.add(messageId);
      pendingRef.current.add(messageId);
      if (!flushTimeoutRef.current) {
        flushTimeoutRef.current = setTimeout(flush, READ_RECEIPT_BATCH_MS);
      }
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) clearTimeout(flushTimeoutRef.current);
    };
  }, []);

  return markAsReadWhenVisible;
}

function UnreadMessageObserver({
  messageId,
  readAt,
  senderId,
  currentUserId,
  onVisible,
  children,
}: {
  messageId: string;
  readAt: string | null;
  senderId: string;
  currentUserId: string;
  onVisible: (id: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (readAt !== null || senderId === currentUserId) return;
    const el = ref.current;
    const viewport = el?.closest(".overflow-y-auto");
    if (!el || !viewport) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || hasTriggered.current) return;
        hasTriggered.current = true;
        onVisible(messageId);
      },
      { root: viewport, rootMargin: "50px", threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [messageId, readAt, senderId, currentUserId, onVisible]);

  return <div ref={ref}>{children}</div>;
}

function ReadReceiptIcon({ readAt }: { readAt: string | null }) {
  if (readAt) {
    return (
      <CheckCheck
        className="text-primary size-3.5 shrink-0"
        aria-label="Lu"
      />
    );
  }
  return (
    <Check
      className="text-muted-foreground size-3.5 shrink-0 opacity-70"
      aria-label="Envoyé"
    />
  );
}

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

function renderSystemMessage(
  metadata: SystemMessageMetadata | undefined,
  contentFallback: string,
  options: { currentUserId: string; sellerId: string; buyerUsername: string | null },
): ReactNode {
  const isSeller = options.currentUserId === options.sellerId;
  if (!metadata || !metadata.type) {
    return <p>{contentFallback}</p>;
  }
  const data = metadata;
  if (data.type === "offer_accepted" && typeof data.offer_amount === "number") {
    const amount = formatEuro(data.offer_amount);
    return (
      <>
        <Handshake className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
        <p className="font-semibold text-foreground">Offre acceptée</p>
        <p className="mt-0">
          {isSeller ? (
            <>
              Vous avez accepté l&apos;offre de {amount}. Nous vous informerons
              quand {options.buyerUsername ?? "l'acheteur"} aura procédé au paiement.
            </>
          ) : (
            <>
              Le vendeur a accepté votre offre de {amount}. Vous pouvez désormais
              procéder au paiement.
            </>
          )}
        </p>
      </>
    );
  }
  if (data.type === "payment_completed" && typeof data.total_amount === "number") {
    const amount = formatEuro(data.total_amount);
    return (
      <>
        <Banknote className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
        <p className="font-semibold text-foreground">Paiement effectué</p>
        <p className="mt-0">
          {isSeller ? (
            <>
              L&apos;acheteur a effectué le paiement de {amount}. Tu peux procéder
              à l&apos;envoi de l&apos;article.
            </>
          ) : (
            <>
              Paiement effectué ({amount}). Le vendeur va t&apos;envoyer l&apos;article.
            </>
          )}
        </p>
      </>
    );
  }
  if (data.type === "order_shipped") {
    return (
      <>
        <Package className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
        <p className="font-semibold text-foreground">Commande expédiée</p>
        <p className="mt-0">
          {isSeller ? (
            <>
              Vous avez marqué cette commande comme expédiée. L&apos;acheteur a été
              invité à confirmer la réception à réception du colis.
            </>
          ) : (
            <>
              La commande a bien été expédiée. Merci de confirmer la réception de la
              commande à réception de celle-ci.
            </>
          )}
        </p>
      </>
    );
  }
  if (data.type === "sale_completed") {
    const sellerCredit = typeof data.seller_credit === "number" ? data.seller_credit : 0;
    return (
      <>
        <CheckCircle2 className="text-amber-600 dark:text-amber-400 size-5 shrink-0" />
        <p className="font-semibold text-foreground">Vente terminée</p>
        <p className="mt-0">
          {isSeller ? (
            <>
              La vente est terminée. Ton solde a été crédité de {formatEuro(sellerCredit)}{" "}
              (montant de la vente).
            </>
          ) : (
            <>La vente est terminée. Merci pour ta confiance.</>
          )}
        </p>
      </>
    );
  }
  return <p>{contentFallback}</p>;
}

function normalizeMessageRow(
  row: {
    id: string;
    sender_id: string;
    content: string;
    created_at: string;
    read_at: string | null;
    message_type?: string | null;
    offer_id?: string | null;
    metadata?: unknown;
    offer?: OfferData | OfferData[] | null;
  },
): ThreadMessage {
  const offer = row.offer;
  const normalizedOffer = Array.isArray(offer) ? offer[0] ?? null : offer;
  return {
    id: row.id,
    sender_id: row.sender_id,
    content: row.content,
    created_at: row.created_at,
    read_at: row.read_at,
    message_type: row.message_type,
    offer_id: row.offer_id,
    metadata: row.metadata as SystemMessageMetadata | ImageMessageMetadata | undefined,
    offer: normalizedOffer ?? undefined,
  };
}

export function ConversationThread({
  messages,
  currentUserId,
  sellerId,
  buyerUsername = null,
  conversationId,
  counterpartName = null,
}: ConversationThreadProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const lastScrollYRef = useRef(0);
  const {
    setHeaderVisible,
    retrySendRef,
    removeOptimisticMessage,
    prependMessages,
    isCounterpartTyping,
    setHasMore,
    hasMore,
    isLoadingOlder,
    setIsLoadingOlder,
    connectionStatus,
  } = useMessagesConversation();

  const scrollHeightBeforePrependRef = useRef<number>(0);
  const markAsReadWhenVisible = useReadReceiptBatcher(conversationId);

  const loadOlder = useCallback(async () => {
    if (messages.length === 0 || !hasMore || isLoadingOlder) return;
    const firstCreatedAt = messages[0].created_at;
    const viewport = viewportRef.current;
    if (viewport) scrollHeightBeforePrependRef.current = viewport.scrollHeight;
    setIsLoadingOlder(true);
    try {
      const result = await fetchOlderMessages(conversationId, firstCreatedAt);
      if (!result.ok || !result.messages?.length) {
        if (result.ok && result.hasMore === false) setHasMore(false);
        return;
      }
      const normalized = result.messages.map(normalizeMessageRow);
      prependMessages(normalized);
      if (result.hasMore === false) setHasMore(false);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [
    conversationId,
    hasMore,
    isLoadingOlder,
    messages,
    prependMessages,
    setHasMore,
    setIsLoadingOlder,
  ]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [messages.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const sentinel = topSentinelRef.current;
    if (!viewport || !sentinel || !hasMore || isLoadingOlder) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) void loadOlder();
      },
      { root: viewport, rootMargin: "50px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingOlder, loadOlder]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const prevHeight = scrollHeightBeforePrependRef.current;
    if (viewport && prevHeight > 0) {
      const delta = viewport.scrollHeight - prevHeight;
      if (delta > 0) viewport.scrollTop += delta;
      scrollHeightBeforePrependRef.current = 0;
    }
  }, [messages.length]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handleScroll = () => {
      const y = el.scrollTop;
      const prev = lastScrollYRef.current;
      lastScrollYRef.current = y;
      if (y <= 10) {
        setHeaderVisible(true);
      } else if (y > prev) {
        setHeaderVisible(false);
      } else if (y < prev) {
        setHeaderVisible(true);
      }
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [setHeaderVisible]);

  const rows = useMemo(() => {
    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const next = messages[index + 1];
      const showDaySeparator =
        index === 0 || toDayKey(previous.created_at) !== toDayKey(message.created_at);
      const groupWithPrevious =
        index > 0 &&
        previous.sender_id === message.sender_id &&
        message.message_type !== "system" &&
        previous.message_type !== "system" &&
        new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < TWO_MINUTES_MS;
      const groupWithNext =
        next != null &&
        next.sender_id === message.sender_id &&
        message.message_type !== "system" &&
        next.message_type !== "system" &&
        new Date(next.created_at).getTime() - new Date(message.created_at).getTime() < TWO_MINUTES_MS;
      return { message, showDaySeparator, groupWithPrevious, groupWithNext };
    });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="text-muted-foreground m-auto text-center text-sm">
        Commence la conversation.
      </div>
    );
  }

  const showConnectionBanner =
    connectionStatus != null && connectionStatus !== "SUBSCRIBED";

  return (
    <div ref={viewportRef} className="flex h-full flex-col justify-end gap-3 overflow-y-auto">
      <div ref={topSentinelRef} className="h-1 shrink-0" aria-hidden />
      {showConnectionBanner ? (
        <div className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 flex items-center justify-center gap-2 px-3 py-2 text-xs">
          <span className="size-2 animate-pulse rounded-full bg-amber-500" aria-hidden />
          Reconnexion en cours...
        </div>
      ) : null}
      {isLoadingOlder ? (
        <div className="text-muted-foreground py-2 text-center text-xs">
          Chargement...
        </div>
      ) : null}
      {rows.map(({ message, showDaySeparator, groupWithPrevious, groupWithNext }) => {
        const isMine = message.sender_id === currentUserId;
        const offer = message.message_type === "offer" ? pickOne(message.offer) : null;
        const isSeller = currentUserId === sellerId;
        const canAcceptOffer = offer && offer.status === "PENDING" && isSeller;

        const bubbleSpacing = groupWithPrevious ? "mt-1" : "mt-2";
        const showReadReceipt = isMine && !groupWithNext;

        return (
          <div key={message.id} className={`space-y-2 ${bubbleSpacing}`}>
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
                  {renderSystemMessage(
                    message.metadata && "type" in message.metadata
                      ? (message.metadata as SystemMessageMetadata)
                      : undefined,
                    message.content,
                    {
                      currentUserId,
                      sellerId,
                      buyerUsername: buyerUsername ?? null,
                    },
                  )}
                </div>
              </div>
            ) : (
            <>
              <UnreadMessageObserver
                messageId={message.id}
                readAt={message.read_at}
                senderId={message.sender_id}
                currentUserId={currentUserId}
                onVisible={markAsReadWhenVisible}
              >
                <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                {offer ? (
                  <div
                    className={`relative max-w-[85%] rounded-lg border px-3 py-2.5 text-sm ${
                      isMine ? "bg-primary/10" : "bg-muted/40"
                    }`}
                  >
                    <div className="flex items-end justify-end gap-1.5">
                      <div className="min-w-0 flex-1">
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
                      {showReadReceipt ? (
                        <ReadReceiptIcon readAt={message.read_at} />
                      ) : null}
                    </div>
                  </div>
                ) : message.message_type === "image" ? (
                  (() => {
                    const imgMeta = message.metadata as ImageMessageMetadata | undefined;
                    const isUploading = imgMeta?.uploading === true;
                    const imageUrl = imgMeta?.image_url;
                    const previewUrl = imgMeta?.preview_url;
                    if (isUploading && previewUrl) {
                      return (
                        <div
                          className={`flex max-w-[85%] items-end justify-end gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-sm ${
                            isMine ? "bg-primary/5" : "bg-muted/30"
                          }`}
                        >
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={previewUrl}
                              alt="Envoi en cours..."
                              className="max-h-[140px] max-w-[125px] rounded-md object-cover opacity-60 blur-[2px]"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Loader2 className="text-muted-foreground size-6 animate-spin" aria-label="Envoi en cours" />
                            </div>
                          </div>
                        </div>
                      );
                    }
                    if (imageUrl) {
                      const storagePath = imgMeta?.storage_path ?? (() => {
                        const m = imageUrl.match(/message_attachments\/(.+)$/);
                        return m?.[1] ?? null;
                      })();
                      const imgSrc = storagePath
                        ? `/api/messages/image?conversationId=${encodeURIComponent(conversationId)}&path=${encodeURIComponent(storagePath)}`
                        : imageUrl;
                      return (
                        <div
                          className={`flex max-w-[85%] items-end justify-end gap-1.5 rounded-lg border px-3 py-2.5 text-sm ${
                            isMine ? "bg-primary/10" : "bg-muted/40"
                          }`}
                        >
                          <a
                            href={imgSrc}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block overflow-hidden rounded-md"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imgSrc}
                              alt="Image envoyée"
                              className="max-h-[280px] max-w-[250px] rounded-md object-contain"
                            />
                          </a>
                          {showReadReceipt ? (
                            <ReadReceiptIcon readAt={message.read_at} />
                          ) : null}
                        </div>
                      );
                    }
                    return null;
                  })()
                ) : message.message_type === "offer" ? (
                  <div
                    className={`flex max-w-[85%] items-end justify-end gap-1.5 rounded-lg border px-3 py-2.5 text-sm ${
                      isMine ? "bg-primary/10" : "bg-muted/40"
                    }`}
                  >
                    <p className="text-muted-foreground min-w-0 flex-1 italic text-sm">
                      {message.content?.trim()
                        ? message.content
                        : "Nouvelle offre reçue"}
                    </p>
                    {showReadReceipt ? (
                      <ReadReceiptIcon readAt={message.read_at} />
                    ) : null}
                  </div>
                ) : (
                  <div
                    className={`flex max-w-[85%] items-end justify-end gap-1.5 rounded-lg border px-3 py-2.5 text-sm ${
                      message.message_type === "optimistic_failed"
                        ? "border-destructive/50 bg-destructive/10"
                        : isMine
                          ? "bg-primary/10"
                          : "bg-muted/40"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                    <p>{message.content}</p>
                    {message.message_type === "optimistic_failed" && (
                      <button
                        type="button"
                        onClick={() => {
                          removeOptimisticMessage(message.id);
                          void retrySendRef.current?.(message.content);
                        }}
                        className="text-destructive hover:underline mt-1 text-xs font-medium"
                      >
                        Échec de l&apos;envoi. Réessaie.
                      </button>
                    )}
                    </div>
                    {showReadReceipt ? (
                      <ReadReceiptIcon readAt={message.read_at} />
                    ) : null}
                  </div>
                )}
                </div>
              </UnreadMessageObserver>
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
      {isCounterpartTyping ? (
        <div className="flex justify-start">
          <div className="bg-muted/60 flex items-center gap-1.5 rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
            <span className="flex gap-0.5" aria-hidden>
              <span className="bg-muted-foreground size-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
              <span className="bg-muted-foreground size-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
              <span className="bg-muted-foreground size-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
            </span>
            <span className="text-muted-foreground text-xs">
              {counterpartName ? `${counterpartName} écrit...` : "L'utilisateur écrit..."}
            </span>
          </div>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}

type ConversationThreadConnectedProps = {
  conversationId: string;
  currentUserId: string;
  sellerId: string;
  buyerUsername?: string | null;
  counterpartName?: string | null;
};

/** Version connectée au contexte : lit les messages depuis l’état client. */
export function ConversationThreadConnected({
  conversationId,
  currentUserId,
  sellerId,
  buyerUsername = null,
  counterpartName = null,
}: ConversationThreadConnectedProps) {
  const { messages } = useMessagesConversation();
  return (
    <ConversationThread
      messages={messages}
      currentUserId={currentUserId}
      sellerId={sellerId}
      buyerUsername={buyerUsername}
      conversationId={conversationId}
      counterpartName={counterpartName}
    />
  );
}
