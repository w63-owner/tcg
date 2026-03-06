"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const REALTIME_SUBSCRIBE_DELAY_MS = 400;

export function MessagesRealtimeListener() {
  const router = useRouter();

  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    const timeoutId = window.setTimeout(() => {
      const supabase = createClient();
      channel = supabase
        .channel("messages:list")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversations" },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          () => router.refresh(),
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
  }, [router]);

  return null;
}
