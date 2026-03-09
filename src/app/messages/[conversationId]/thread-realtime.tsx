"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  useMessagesConversation,
  normalizeRealtimeMessage,
} from "./messages-conversation-state";
import { markConversationReadSilentAction } from "@/app/messages/actions";

const REALTIME_SUBSCRIBE_DELAY_MS = 400;

type ThreadRealtimeProps = {
  conversationId: string;
  currentUserId: string;
};

export function ThreadRealtime({
  conversationId,
  currentUserId,
}: ThreadRealtimeProps) {
  const { addMessage } = useMessagesConversation();
  const addMessageRef = useRef(addMessage);
  addMessageRef.current = addMessage;

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
      null;
    const timeoutId = window.setTimeout(() => {
      const supabase = createClient();
      channel = supabase
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
        .subscribe();
    }, REALTIME_SUBSCRIBE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (channel) {
        const supabase = createClient();
        void supabase.removeChannel(channel);
      }
    };
  }, [conversationId, currentUserId]);

  return null;
}
