"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const REALTIME_SUBSCRIBE_DELAY_MS = 400;

type ThreadRealtimeProps = {
  conversationId: string;
};

export function ThreadRealtime({ conversationId }: ThreadRealtimeProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    // 1. Force le refresh au montage (avec startTransition pour que Next.js ne l'ignore pas pendant la navigation)
    const initialRefresh = setTimeout(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 50);

    // 2. Force le refresh quand le navigateur sort de l'arrière-plan (très courant sur mobile)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startTransition(() => {
          router.refresh();
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 3. Écoute des événements temps réel Supabase
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
            startTransition(() => {
              router.refresh();
            });
          },
        )
        .subscribe();
    }, REALTIME_SUBSCRIBE_DELAY_MS);

    return () => {
      clearTimeout(initialRefresh);
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (channel) {
        const supabase = createClient();
        void supabase.removeChannel(channel);
      }
    };
  }, [conversationId, router]);

  return null;
}