"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type SavedSearchesRealtimeListenerProps = {
  totalNewMatches: number;
};

export function SavedSearchesRealtimeListener({
  totalNewMatches,
}: SavedSearchesRealtimeListenerProps) {
  const router = useRouter();
  const previousCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (previousCountRef.current === null) {
      previousCountRef.current = totalNewMatches;
      return;
    }

    if (totalNewMatches > previousCountRef.current) {
      const delta = totalNewMatches - previousCountRef.current;
      toast.success(
        `${delta} nouvelle${delta > 1 ? "s" : ""} annonce${delta > 1 ? "s" : ""} correspond a tes recherches sauvegardees.`,
      );
    }
    previousCountRef.current = totalNewMatches;
  }, [totalNewMatches]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("saved-searches-listener")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "listings" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
