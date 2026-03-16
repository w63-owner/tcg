"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { uploadMessageImageAction } from "../actions";
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
  const {
    addOptimisticMessage,
    addMessage,
    markOptimisticFailed,
    retrySendRef,
    setIsCounterpartTyping,
  } = useMessagesConversation();

  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MIN_TEXTAREA_HEIGHT = 40;
  const MAX_TEXTAREA_HEIGHT = 120;
  const lastTypingEmitRef = useRef<number>(0);
  const TYPING_THROTTLE_MS = 1000;

  const emitTyping = useCallback((typing: boolean) => {
    const channel = channelRef.current;
    if (!channel) return;
    if (typing) {
      const now = Date.now();
      if (now - lastTypingEmitRef.current < TYPING_THROTTLE_MS) return;
      lastTypingEmitRef.current = now;
    }
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: currentUserId, typing },
    });
  }, [currentUserId]);

  const performSend = useCallback(async (trimmed: string) => {
    const tempId = crypto.randomUUID();
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
      const json = (await response.json()) as {
        ok?: boolean;
        messageId?: string;
        createdAt?: string;
        error?: string;
      };
      if (!response.ok || !json.ok) {
        markOptimisticFailed(tempId);
        setContent(trimmed);
        toast.error(json.error ?? "Envoi impossible.");
        return;
      }
      addMessage({
        id: json.messageId ?? tempId,
        sender_id: currentUserId,
        content: trimmed,
        created_at: json.createdAt ?? new Date().toISOString(),
        read_at: null,
      });
    } catch {
      markOptimisticFailed(tempId);
      setContent(trimmed);
      toast.error("Erreur reseau lors de l'envoi.");
    } finally {
      setIsSending(false);
    }
  }, [
    addMessage,
    addOptimisticMessage,
    conversationId,
    currentUserId,
    emitTyping,
    markOptimisticFailed,
  ]);

  useEffect(() => {
    retrySendRef.current = performSend;
    return () => {
      retrySendRef.current = null;
    };
  }, [performSend, retrySendRef]);

  useEffect(() => {
    const channel = supabase.channel(`conversation:${conversationId}`, {
      config: { presence: { key: currentUserId } },
    });

    let typingResetTimeoutId: ReturnType<typeof setTimeout> | null = null;

    channel
      .on("presence", { event: "sync" }, () => {
        channel.presenceState();
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const data = payload as TypingPayload;
        if (data.userId !== counterpartUserId || data.userId === currentUserId) return;
        if (typingResetTimeoutId) {
          clearTimeout(typingResetTimeoutId);
          typingResetTimeoutId = null;
        }
        setIsCounterpartTyping(Boolean(data.typing));
        if (data.typing) {
          typingResetTimeoutId = setTimeout(() => {
            setIsCounterpartTyping(false);
            typingResetTimeoutId = null;
          }, 3000);
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
      if (typingResetTimeoutId) clearTimeout(typingResetTimeoutId);
      setIsCounterpartTyping(false);
      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, counterpartUserId, currentUserId, supabase]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const height = Math.min(
      MAX_TEXTAREA_HEIGHT,
      Math.max(MIN_TEXTAREA_HEIGHT, el.scrollHeight),
    );
    el.style.height = `${height}px`;
  }, [content]);

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
    await performSend(trimmed);
  };

  const onImageSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || isSending) return;
      event.target.value = "";

      const tempId = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(file);
      addOptimisticMessage({
        id: tempId,
        sender_id: currentUserId,
        content: "Image envoyée",
        created_at: new Date().toISOString(),
        read_at: null,
        message_type: "image",
        metadata: { uploading: true, preview_url: objectUrl },
      });

      setIsUploadingImage(true);
      try {
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadMessageImageAction(conversationId, formData);

        if (result.ok && result.message) {
          addMessage({
            id: result.message.id,
            sender_id: currentUserId,
            content: result.message.content,
            created_at: result.message.created_at,
            read_at: result.message.read_at,
            message_type: "image",
            metadata: result.message.metadata,
          });
        } else {
          markOptimisticFailed(tempId);
          toast.error(result.error ?? "Impossible d'envoyer l'image.");
        }
      } catch {
        markOptimisticFailed(tempId);
        toast.error("Erreur lors de l'envoi de l'image.");
      } finally {
        setIsUploadingImage(false);
        URL.revokeObjectURL(objectUrl);
      }
    },
    [
      addMessage,
      addOptimisticMessage,
      conversationId,
      currentUserId,
      isSending,
      markOptimisticFailed,
    ],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg, image/png, image/webp"
          className="hidden"
          onChange={onImageSelect}
          aria-label="Envoyer une image"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSending || isUploadingImage}
          className="shrink-0"
          aria-label="Joindre une image"
        >
          {isUploadingImage ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Image className="size-4" />
          )}
        </Button>
        <textarea
          ref={textareaRef}
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
          rows={1}
          className={cn(
            "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex w-full resize-none overflow-y-auto rounded-xl border bg-transparent px-3 py-2.5 text-base shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            "min-h-[40px] max-h-[120px] transition-[height] duration-150 ease-out",
          )}
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
