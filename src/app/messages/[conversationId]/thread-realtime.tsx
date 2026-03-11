"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  useMessagesConversation,
  normalizeRealtimeMessage,
  type ThreadMessage,
} from "./messages-conversation-state";
import { fetchMessagesSince } from "@/app/messages/actions";
import type { FetchOlderMessagesRow } from "@/app/messages/actions";

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
  } = useMessagesConversation();
  const addMessageRef = useRef(addMessage);
  addMessageRef.current = addMessage;
  const updateMessageReadAtRef = useRef(updateMessageReadAt);
  updateMessageReadAtRef.current = updateMessageReadAt;
  const mergeMissedMessagesRef = useRef(mergeMissedMessages);
  mergeMissedMessagesRef.current = mergeMissedMessages;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const wasDisconnectedRef = useRef(false);

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
                void fetchMessagesSince(conversationId, lastCreatedAt).then(
                  (result) => {
                    if (
                      result.ok &&
                      result.messages &&
                      result.messages.length > 0
                    ) {
                      mergeMissedMessagesRef.current(
                        result.messages.map(normalizeMessageRow),
                      );
                    }
                    wasDisconnectedRef.current = false;
                    setConnectionStatus("connected");
                  },
                );
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
