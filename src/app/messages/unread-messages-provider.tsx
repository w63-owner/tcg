"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { getUnreadMessagesCount } from "./actions";

type UnreadMessagesContextValue = {
  unreadCount: number;
};

const UnreadMessagesContext =
  createContext<UnreadMessagesContextValue | null>(null);

type UnreadMessagesProviderProps = {
  initialCount: number;
  currentUserId: string | null;
  children: ReactNode;
};

export function UnreadMessagesProvider({
  initialCount,
  currentUserId,
  children,
}: UnreadMessagesProviderProps) {
  const [unreadCount, setUnreadCount] = useState(initialCount);

  const refetchCount = useCallback(async () => {
    const count = await getUnreadMessagesCount();
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("unread-messages-global")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const row = payload.new as { sender_id?: string; read_at?: string } | null;
          if (
            row &&
            row.sender_id !== currentUserId &&
            (row.read_at == null || row.read_at === "")
          ) {
            void refetchCount();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        () => {
          void refetchCount();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, refetchCount]);

  useEffect(() => {
    setUnreadCount(initialCount);
  }, [initialCount]);

  return (
    <UnreadMessagesContext.Provider value={{ unreadCount }}>
      {children}
    </UnreadMessagesContext.Provider>
  );
}

export function useUnreadMessages(): UnreadMessagesContextValue {
  const ctx = useContext(UnreadMessagesContext);
  if (!ctx) {
    throw new Error(
      "useUnreadMessages must be used within UnreadMessagesProvider",
    );
  }
  return ctx;
}
