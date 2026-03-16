import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/observability";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!vapidPublic || !vapidPrivate) return false;
  const mailto = process.env.VAPID_MAILTO?.trim() || "mailto:support@example.com";
  webpush.setVapidDetails(mailto, vapidPublic, vapidPrivate);
  vapidConfigured = true;
  return true;
}

export async function sendPushToRecipient(
  recipientUserId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapidConfigured()) return;

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, subscription")
    .eq("user_id", recipientUserId);

  if (!subs?.length) return;

  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map(async (row) => {
      const sub = row.subscription as webpush.PushSubscription;
      if (!sub?.endpoint) return;
      try {
        await webpush.sendNotification(sub, body);
      } catch (err) {
        const statusCode = err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : null;
        if (statusCode === 410 || statusCode === 404) {
          await admin.from("push_subscriptions").delete().eq("id", row.id);
        } else {
          logError({
            event: "push_send_failed",
            message: err instanceof Error ? err.message : "unknown",
            context: { recipientUserId, subscriptionId: row.id },
          });
        }
      }
    }),
  );

  void results;
}
