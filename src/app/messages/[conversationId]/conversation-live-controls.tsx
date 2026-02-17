"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

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
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCounterpartOnline, setIsCounterpartOnline] = useState(false);
  const [isCounterpartTyping, setIsCounterpartTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const channel = supabase.channel(`conversation:${conversationId}`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => router.refresh(),
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const online = Object.keys(state).includes(counterpartUserId);
        setIsCounterpartOnline(online);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const data = payload as TypingPayload;
        if (data.userId !== counterpartUserId) return;
        setIsCounterpartTyping(Boolean(data.typing));
        if (typingIndicatorTimeoutRef.current) {
          clearTimeout(typingIndicatorTimeoutRef.current);
        }
        if (data.typing) {
          typingIndicatorTimeoutRef.current = setTimeout(() => {
            setIsCounterpartTyping(false);
          }, 1700);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ at: Date.now() });
        }
      });

    channelRef.current = channel;
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (typingIndicatorTimeoutRef.current) clearTimeout(typingIndicatorTimeoutRef.current);
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [conversationId, counterpartUserId, currentUserId, router, supabase]);

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
        toast.error(json.error ?? "Envoi impossible.");
        return;
      }
      setContent("");
      emitTyping(false);
      router.refresh();
    } catch {
      toast.error("Erreur reseau lors de l'envoi.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        {isCounterpartTyping
          ? `${counterpartName} ecrit...`
          : isCounterpartOnline
            ? `${counterpartName} est en ligne`
            : `${counterpartName} est hors ligne`}
      </p>
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
          onClick={onSend}
          disabled={isSending || !content.trim()}
          className="shrink-0"
        >
          {isSending ? "..." : "Envoyer"}
        </Button>
      </div>
    </div>
  );
}
