"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const REALTIME_SUBSCRIBE_DELAY_MS = 400;

type ThreadRealtimeProps = {
  conversationId: string;
};

export function ThreadRealtime({ conversationId }: ThreadRealtimeProps) {
  const router = useRouter();

  useEffect(() => {
    router.refresh();
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    const timeoutId = window.setTimeout(() => {
      const supabase = createClient();
      channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          () => {
            router.refresh();
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
  }, [conversationId, router]);

  return null;
}
