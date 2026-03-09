"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const REALTIME_SUBSCRIBE_DELAY_MS = 400;

type MessagesRealtimeListenerProps = {
  currentUserId: string;
};

/**
 * Écoute uniquement les conversations où l'utilisateur est participant
 * (buyer_id ou seller_id = currentUserId). Ne plus écouter la table messages
 * pour éviter d'exposer tous les messages de la plateforme.
 */
export function MessagesRealtimeListener({
  currentUserId,
}: MessagesRealtimeListenerProps) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!currentUserId) return;

    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
      null;
    const timeoutId = window.setTimeout(() => {
      const supabase = createClient();
      // Deux abonnements distincts : Supabase ne supporte pas le OR dans un seul filtre.
      const ch = supabase.channel(`user-conversations:${currentUserId}`);
      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `buyer_id=eq.${currentUserId}`,
        },
        () => {
          routerRef.current.refresh();
        },
      );
      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `seller_id=eq.${currentUserId}`,
        },
        () => {
          routerRef.current.refresh();
        },
      );
      ch.subscribe();
      channel = ch;
    }, REALTIME_SUBSCRIBE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (channel) {
        const supabase = createClient();
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [currentUserId]);

  return null;
}
