"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useMessagesConversation } from "./messages-conversation-state";

type ConversationLiveControlsProps = {
  conversationId: string;
  currentUserId: string;
  counterpartUserId: string;
  counterpartName: string;
};

type TypingPayload = {
  userId: string;
  typing: boolean;
};

export function ConversationLiveControls({
  conversationId,
  currentUserId,
  counterpartUserId,
  counterpartName,
}: ConversationLiveControlsProps) {
  const supabase = useMemo(() => createClient(), []);
  const { addOptimisticMessage, removeOptimisticMessage } =
    useMessagesConversation();

  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCounterpartTyping, setIsCounterpartTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const channel = supabase.channel(`conversation:${conversationId}`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        channel.presenceState();
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const data = payload as TypingPayload;
        if (data.userId !== counterpartUserId) return;
        setIsCounterpartTyping(Boolean(data.typing));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ at: Date.now() });
        }
      });

    channelRef.current = channel;
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setIsCounterpartTyping(false);
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, counterpartUserId, currentUserId, supabase]);

  const emitTyping = (typing: boolean) => {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: currentUserId, typing },
    });
  };

  const onChange = (value: string) => {
    setContent(value);
    emitTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(false);
    }, 800);
  };

  const onSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;

    const tempId = `optimistic-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      sender_id: currentUserId,
      content: trimmed,
      created_at: new Date().toISOString(),
      read_at: null as string | null,
    };

    addOptimisticMessage(optimisticMessage);
    setContent("");
    emitTyping(false);
    setIsSending(true);

    try {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          content: trimmed,
        }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) {
        removeOptimisticMessage(tempId);
        setContent(trimmed);
        toast.error(json.error ?? "Envoi impossible.");
        return;
      }
      // Le Realtime remplacera le message optimiste par le vrai
    } catch {
      removeOptimisticMessage(tempId);
      setContent(trimmed);
      toast.error("Erreur reseau lors de l'envoi.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {isCounterpartTyping ? (
        <p className="text-muted-foreground flex items-center gap-1 text-xs italic">
          <span>{counterpartName} est en train d&apos;écrire</span>
          <span className="inline-flex gap-0.5">
            <span className="animate-bounce [animation-delay:0ms]">.</span>
            <span className="animate-bounce [animation-delay:150ms]">.</span>
            <span className="animate-bounce [animation-delay:300ms]">.</span>
          </span>
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Input
          value={content}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSend();
            }
          }}
          placeholder="Ecris ton message..."
          maxLength={2000}
        />
        <Button
          type="button"
          size="icon"
          onClick={onSend}
          disabled={isSending || !content.trim()}
          className="shrink-0"
          aria-label="Envoyer le message"
        >
          {isSending ? "..." : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
