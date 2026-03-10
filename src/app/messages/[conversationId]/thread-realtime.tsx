"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  useMessagesConversation,
  normalizeRealtimeMessage,
  type ThreadMessage,
} from "./messages-conversation-state";
import { fetchMessagesAfter } from "@/app/messages/actions";
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
    appendMessages,
    messages,
    setConnectionStatus,
  } = useMessagesConversation();
  const addMessageRef = useRef(addMessage);
  addMessageRef.current = addMessage;
  const updateMessageReadAtRef = useRef(updateMessageReadAt);
  updateMessageReadAtRef.current = updateMessageReadAt;
  const appendMessagesRef = useRef(appendMessages);
  appendMessagesRef.current = appendMessages;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const refetchSinceLastMessage = useCallback(async () => {
    const msgs = messagesRef.current;
    if (msgs.length === 0) return;
    const lastMsg = msgs[msgs.length - 1];
    const lastCreatedAt = lastMsg?.created_at;
    if (!lastCreatedAt) return;
    const result = await fetchMessagesAfter(conversationId, lastCreatedAt);
    if (result.ok && result.messages && result.messages.length > 0) {
      appendMessagesRef.current(
        result.messages.map(normalizeMessageRow),
      );
    }
  }, [conversationId]);

  const refetchRef = useRef(refetchSinceLastMessage);
  refetchRef.current = refetchSinceLastMessage;

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
        setConnectionStatus(status);
        if (status === "SUBSCRIBED") {
          void refetchRef.current();
        }
      });

    return () => {
      setConnectionStatus(null);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, setConnectionStatus]);

  return null;
}
