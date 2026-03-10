"use client";

import type { ImageMessageMetadata, SystemMessageMetadata } from "../types";
import type { MutableRefObject } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type { ImageMessageMetadata, SystemMessageMetadata } from "../types";

export type ThreadMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  message_type?: string | null;
  offer_id?: string | null;
  offer?: {
    id: string;
    offer_amount: number;
    status: string;
    buyer_id: string;
    listing_id: string;
  } | Array<{
    id: string;
    offer_amount: number;
    status: string;
    buyer_id: string;
    listing_id: string;
  }> | null;
  metadata?: SystemMessageMetadata | ImageMessageMetadata;
};

type MessagesConversationContextValue = {
  messages: ThreadMessage[];
  addMessage: (msg: ThreadMessage) => void;
  addOptimisticMessage: (msg: Omit<ThreadMessage, "id"> & { id: string }) => void;
  removeOptimisticMessage: (tempId: string) => void;
  markOptimisticFailed: (tempId: string) => void;
  updateMessageReadAt: (messageId: string, readAt: string | null) => void;
  retrySendRef: MutableRefObject<((content: string) => Promise<void>) | null>;
  prependMessages: (olderMessages: ThreadMessage[]) => void;
  setHasMore: (hasMore: boolean) => void;
  hasMore: boolean;
  isLoadingOlder: boolean;
  setIsLoadingOlder: (loading: boolean) => void;
  fetchOfferDetails: (offerId: string) => Promise<void>;
  isCounterpartTyping: boolean;
  setIsCounterpartTyping: (typing: boolean) => void;
  headerVisible: boolean;
  setHeaderVisible: (visible: boolean) => void;
};

const MessagesConversationContext =
  createContext<MessagesConversationContextValue | null>(null);

type OfferData = {
  id: string;
  offer_amount: number;
  status: string;
  buyer_id: string;
  listing_id: string;
};

function normalizeOfferRow(raw: unknown): OfferData | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    id: String(o.id ?? ""),
    offer_amount: Number(o.offer_amount ?? 0),
    status: String(o.status ?? ""),
    buyer_id: String(o.buyer_id ?? ""),
    listing_id: String(o.listing_id ?? ""),
  };
}

/** Normalise un payload Realtime (snake_case) en ThreadMessage. Gère message_type et offer_id pour les offres. */
export function normalizeRealtimeMessage(payload: Record<string, unknown>): ThreadMessage {
  const messageType =
    payload.message_type != null && String(payload.message_type).trim() !== ""
      ? String(payload.message_type)
      : null;
  const offerId =
    payload.offer_id != null && String(payload.offer_id).trim() !== ""
      ? String(payload.offer_id)
      : null;

  let offer: ThreadMessage["offer"] = undefined;
  if (payload.offer != null) {
    const rawOffer = payload.offer;
    if (Array.isArray(rawOffer) && rawOffer.length > 0) {
      offer = rawOffer.map((item) => normalizeOfferRow(item)).filter((x): x is OfferData => x != null) as ThreadMessage["offer"];
    } else if (typeof rawOffer === "object") {
      const one = normalizeOfferRow(rawOffer);
      offer = one ?? undefined;
    }
  }

  let metadata: SystemMessageMetadata | ImageMessageMetadata | undefined = undefined;
  if (payload.metadata != null && typeof payload.metadata === "object") {
    const m = payload.metadata as Record<string, unknown>;
    if (m.type && typeof m.type === "string") {
      metadata = {
        type: m.type as "offer_accepted" | "payment_completed" | "order_shipped" | "sale_completed",
        offer_amount: typeof m.offer_amount === "number" ? m.offer_amount : undefined,
        total_amount: typeof m.total_amount === "number" ? m.total_amount : undefined,
        seller_credit: typeof m.seller_credit === "number" ? m.seller_credit : undefined,
      };
    } else if (m.image_url && typeof m.image_url === "string") {
      metadata = { image_url: m.image_url };
    }
  }

  return {
    id: String(payload.id ?? ""),
    sender_id: String(payload.sender_id ?? ""),
    content: String(payload.content ?? ""),
    created_at: String(payload.created_at ?? new Date().toISOString()),
    read_at: payload.read_at != null ? String(payload.read_at) : null,
    message_type: messageType,
    offer_id: offerId,
    offer: offer ?? undefined,
    metadata,
  };
}

type MessagesConversationProviderProps = {
  initialMessages: ThreadMessage[];
  conversationId: string;
  currentUserId: string;
  initialHasMore?: boolean;
  children: ReactNode;
};

export function MessagesConversationProvider({
  initialMessages,
  conversationId,
  currentUserId,
  initialHasMore = true,
  children,
}: MessagesConversationProviderProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isCounterpartTyping, setIsCounterpartTyping] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastOptimisticIdRef = useRef<string | null>(null);
  const retrySendRef = useRef<((content: string) => Promise<void>) | null>(null);

  const prependMessages = useCallback((olderMessages: ThreadMessage[]) => {
    setMessages((prev) => [...olderMessages, ...prev]);
  }, []);


  const addMessage = useCallback(
    (newMsg: ThreadMessage) => {
      setMessages((prev) => {
        const optimisticId = lastOptimisticIdRef.current;
        if (
          optimisticId &&
          newMsg.sender_id === currentUserId &&
          prev.some((m) => m.id === optimisticId)
        ) {
          lastOptimisticIdRef.current = null;
          return prev.map((m) => (m.id === optimisticId ? newMsg : m));
        }
        const existingIdx = prev.findIndex((m) => m.id === newMsg.id);
        if (existingIdx >= 0) {
          return prev.map((m) => (m.id === newMsg.id ? newMsg : m));
        }
        return [...prev, newMsg];
      });
      if (
        newMsg.message_type === "offer" &&
        newMsg.offer_id &&
        !newMsg.offer
      ) {
        void fetchOfferDetailsRef.current(newMsg.offer_id);
      }
    },
    [currentUserId],
  );

  const fetchOfferDetails = useCallback(async (offerId: string) => {
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(offerId)}`);
      if (!res.ok) return;
      const offer = (await res.json()) as OfferData;
      if (!offer?.id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.offer_id === offerId ? { ...m, offer } : m,
        ),
      );
    } catch {
      // Ignore: keep fallback UI
    }
  }, []);

  const fetchOfferDetailsRef = useRef(fetchOfferDetails);
  fetchOfferDetailsRef.current = fetchOfferDetails;

  const addOptimisticMessage = useCallback(
    (msg: Omit<ThreadMessage, "id"> & { id: string }) => {
      lastOptimisticIdRef.current = msg.id;
      setMessages((prev) => [...prev, msg as ThreadMessage]);
    },
    [],
  );

  const removeOptimisticMessage = useCallback((tempId: string) => {
    lastOptimisticIdRef.current = null;
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
  }, []);

  const updateMessageReadAt = useCallback((messageId: string, readAt: string | null) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, read_at: readAt } : m)),
    );
  }, []);

  const markOptimisticFailed = useCallback((tempId: string) => {
    lastOptimisticIdRef.current = null;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempId ? { ...m, message_type: "optimistic_failed" } : m,
      ),
    );
  }, []);

  const value: MessagesConversationContextValue = {
    messages,
    addMessage,
    addOptimisticMessage,
    removeOptimisticMessage,
    markOptimisticFailed,
    updateMessageReadAt,
    retrySendRef,
    prependMessages,
    setHasMore,
    hasMore,
    isLoadingOlder,
    setIsLoadingOlder,
    fetchOfferDetails,
    isCounterpartTyping,
    setIsCounterpartTyping,
    headerVisible,
    setHeaderVisible,
  };

  return (
    <MessagesConversationContext.Provider value={value}>
      {children}
    </MessagesConversationContext.Provider>
  );
}

export function useMessagesConversation(): MessagesConversationContextValue {
  const ctx = useContext(MessagesConversationContext);
  if (!ctx) {
    throw new Error(
      "useMessagesConversation must be used within MessagesConversationProvider",
    );
  }
  return ctx;
}
