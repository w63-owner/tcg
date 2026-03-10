"use server";

import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/observability";

export type SavePushSubscriptionResult = {
  ok: boolean;
  error?: string;
};

export async function savePushSubscriptionAction(
  subscription: PushSubscriptionJSON,
): Promise<SavePushSubscriptionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Non connecté." };
  }

  const endpoint = subscription?.endpoint;
  if (!endpoint || typeof endpoint !== "string") {
    return { ok: false, error: "Abonnement invalide." };
  }

  const { data: existingRows } = await supabase
    .from("push_subscriptions")
    .select("id, subscription")
    .eq("user_id", user.id);

  const alreadyExists = (existingRows ?? []).some(
    (row) => (row.subscription as { endpoint?: string })?.endpoint === endpoint,
  );
  if (alreadyExists) {
    return { ok: true };
  }

  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: user.id,
    subscription: subscription as unknown as Record<string, unknown>,
  });

  if (error) {
    logError({
      event: "push_subscription_save_failed",
      message: error.message,
      context: { userId: user.id },
    });
    return { ok: false, error: "Impossible d'enregistrer l'abonnement." };
  }
  return { ok: true };
}
