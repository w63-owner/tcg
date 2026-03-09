"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
};

type MessagesConversationContextValue = {
  messages: ThreadMessage[];
  addMessage: (msg: ThreadMessage) => void;
  addOptimisticMessage: (msg: Omit<ThreadMessage, "id"> & { id: string }) => void;
  removeOptimisticMessage: (tempId: string) => void;
  markOptimisticFailed: (tempId: string) => void;
  fetchOfferDetails: (offerId: string) => Promise<void>;
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

  return {
    id: String(payload.id ?? ""),
    sender_id: String(payload.sender_id ?? ""),
    content: String(payload.content ?? ""),
    created_at: String(payload.created_at ?? new Date().toISOString()),
    read_at: payload.read_at != null ? String(payload.read_at) : null,
    message_type: messageType,
    offer_id: offerId,
    offer: offer ?? undefined,
  };
}

type MessagesConversationProviderProps = {
  initialMessages: ThreadMessage[];
  conversationId: string;
  currentUserId: string;
  children: ReactNode;
};

export function MessagesConversationProvider({
  initialMessages,
  conversationId,
  currentUserId,
  children,
}: MessagesConversationProviderProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const lastOptimisticIdRef = useRef<string | null>(null);

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
        if (prev.some((m) => m.id === newMsg.id)) return prev;
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
    fetchOfferDetails,
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
