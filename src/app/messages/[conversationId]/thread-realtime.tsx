"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  useMessagesConversation,
  normalizeRealtimeMessage,
  type ThreadMessage,
} from "./messages-conversation-state";
import { fetchMessagesSince, getAcceptedOfferIdForConversation } from "@/app/messages/actions";
import type { FetchOlderMessagesRow } from "@/app/messages/actions";

const SERVER_REFRESH_TYPES = new Set(["payment_completed", "order_shipped", "sale_completed"]);

type ThreadRealtimeProps = {
  conversationId: string;
  currentUserId: string;
};

function normalizeMessageRow(row: FetchOlderMessagesRow): ThreadMessage {
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
    metadata: row.metadata as ThreadMessage["metadata"],
    offer: normalizedOffer ?? undefined,
  };
}

export function ThreadRealtime({
  conversationId,
  currentUserId,
}: ThreadRealtimeProps) {
  const {
    addMessage,
    updateMessageReadAt,
    messages,
    setConnectionStatus,
    mergeMissedMessages,
    setAcceptedOfferId,
  } = useMessagesConversation();
  const addMessageRef = useRef(addMessage);
  addMessageRef.current = addMessage;
  const updateMessageReadAtRef = useRef(updateMessageReadAt);
  updateMessageReadAtRef.current = updateMessageReadAt;
  const mergeMissedMessagesRef = useRef(mergeMissedMessages);
  mergeMissedMessagesRef.current = mergeMissedMessages;
  const setAcceptedOfferIdRef = useRef(setAcceptedOfferId);
  setAcceptedOfferIdRef.current = setAcceptedOfferId;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const wasDisconnectedRef = useRef(false);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          if (raw && typeof raw === "object") {
            const msg = normalizeRealtimeMessage(raw);
            addMessageRef.current(msg);
            if (raw.message_type === "system") {
              const meta = msg.metadata as { type?: string } | undefined;
              if (meta?.type && SERVER_REFRESH_TYPES.has(meta.type)) {
                routerRef.current.refresh();
              }
              if (meta?.type === "offer_accepted" && raw.sender_id !== currentUserIdRef.current) {
                const msgs = messagesRef.current;
                const offerMsg = [...msgs].reverse().find(
                  (m) => m.message_type === "offer" && m.sender_id === currentUserIdRef.current && m.offer_id,
                );
                if (offerMsg?.offer_id) {
                  setAcceptedOfferIdRef.current(offerMsg.offer_id);
                } else {
                  // Fallback: offer message not yet in list (race condition), fetch from server
                  void getAcceptedOfferIdForConversation(conversationId).then((id) => {
                    if (id) setAcceptedOfferIdRef.current(id);
                  });
                }
              } else if (
                meta?.type === "offer_cancelled_by_buyer" ||
                meta?.type === "payment_completed" ||
                meta?.type === "sale_completed"
              ) {
                // Clear for all tabs regardless of who sent the message
                setAcceptedOfferIdRef.current(null);
              }
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          if (raw && typeof raw === "object" && typeof raw.id === "string") {
            const readAt =
              raw.read_at != null ? String(raw.read_at) : null;
            updateMessageReadAtRef.current(raw.id, readAt);
          }
        },
      )
      .subscribe((status) => {
        switch (status) {
          case "SUBSCRIBED": {
            if (wasDisconnectedRef.current) {
              const msgs = messagesRef.current;
              const lastCreatedAt =
                msgs.length > 0 ? msgs[msgs.length - 1].created_at : null;
              if (lastCreatedAt) {
                setConnectionStatus("reconnecting");
                void fetchMessagesSince(conversationId, lastCreatedAt)
                  .then((result) => {
                    let needsServerRefresh = false;
                    if (
                      result.ok &&
                      result.messages &&
                      result.messages.length > 0
                    ) {
                      const normalized = result.messages.map(normalizeMessageRow);
                      mergeMissedMessagesRef.current(normalized);
                      for (const m of normalized) {
                        if (m.message_type === "system") {
                          const meta = m.metadata as { type?: string } | undefined;
                          if (meta?.type && SERVER_REFRESH_TYPES.has(meta.type)) {
                            needsServerRefresh = true;
                          }
                          if (meta?.type === "offer_accepted" && m.sender_id !== currentUserIdRef.current) {
                            const msgs = messagesRef.current;
                            const offerMsg = [...msgs].reverse().find(
                              (o) => o.message_type === "offer" && o.sender_id === currentUserIdRef.current && o.offer_id,
                            );
                            if (offerMsg?.offer_id) {
                              setAcceptedOfferIdRef.current(offerMsg.offer_id);
                            } else {
                              void getAcceptedOfferIdForConversation(conversationId).then((id) => {
                                if (id) setAcceptedOfferIdRef.current(id);
                              });
                            }
                          } else if (
                            meta?.type === "offer_cancelled_by_buyer" ||
                            meta?.type === "payment_completed" ||
                            meta?.type === "sale_completed"
                          ) {
                            setAcceptedOfferIdRef.current(null);
                          }
                        }
                      }
                    }
                    if (needsServerRefresh) routerRef.current.refresh();
                    wasDisconnectedRef.current = false;
                    setConnectionStatus("connected");
                  })
                  .catch(() => {
                    wasDisconnectedRef.current = false;
                    setConnectionStatus("connected");
                  });
                return;
              }
            }
            wasDisconnectedRef.current = false;
            setConnectionStatus("connected");
            break;
          }
          case "CHANNEL_ERROR":
          case "TIMED_OUT":
          case "CLOSED":
            wasDisconnectedRef.current = true;
            setConnectionStatus("disconnected");
            break;
          default:
            break;
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, setConnectionStatus]);

  return null;
}
