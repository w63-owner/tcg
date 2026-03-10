"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  useMessagesConversation,
  normalizeRealtimeMessage,
} from "./messages-conversation-state";
import { markConversationReadSilentAction } from "@/app/messages/actions";

type ThreadRealtimeProps = {
  conversationId: string;
  currentUserId: string;
};

export function ThreadRealtime({
  conversationId,
  currentUserId,
}: ThreadRealtimeProps) {
  const { addMessage, updateMessageReadAt } = useMessagesConversation();
  const addMessageRef = useRef(addMessage);
  addMessageRef.current = addMessage;
  const updateMessageReadAtRef = useRef(updateMessageReadAt);
  updateMessageReadAtRef.current = updateMessageReadAt;

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
            if (msg.sender_id !== currentUserId) {
              const formData = new FormData();
              formData.set("conversation_id", conversationId);
              void markConversationReadSilentAction(formData);
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  return null;
}
