"use client";

import { useEffect, useMemo, useRef } from "react";

type ThreadMessage = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

type ConversationThreadProps = {
  messages: ThreadMessage[];
  currentUserId: string;
};

function toDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown-day";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ConversationThread({
  messages,
  currentUserId,
}: ConversationThreadProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const rows = useMemo(() => {
    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const showDaySeparator =
        index === 0 || toDayKey(previous.created_at) !== toDayKey(message.created_at);
      return { message, showDaySeparator };
    });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="text-muted-foreground m-auto rounded-md border px-4 py-2 text-sm">
        Commence la conversation.
      </div>
    );
  }

  return (
    <div ref={viewportRef} className="flex h-full flex-col gap-3 overflow-y-auto">
      {rows.map(({ message, showDaySeparator }) => {
        const isMine = message.sender_id === currentUserId;
        return (
          <div key={message.id} className="space-y-2">
            {showDaySeparator ? (
              <div className="flex items-center justify-center">
                <span className="bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]">
                  {formatDayLabel(message.created_at)}
                </span>
              </div>
            ) : null}
            <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-md border px-3 py-2 text-sm ${
                  isMine ? "bg-primary/10" : "bg-muted/40"
                }`}
              >
                <p>{message.content}</p>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  {new Date(message.created_at).toLocaleString("fr-FR")}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
