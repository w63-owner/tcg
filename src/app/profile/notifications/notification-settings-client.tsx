"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { savePushSubscriptionAction } from "./actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const NOTIFICATION_ITEMS = [
  { key: "notif_new_messages", label: "Nouveaux messages" },
  { key: "notif_new_reviews", label: "Nouvelles evaluations" },
  { key: "notif_favorites_discount", label: "Articles favoris en promo" },
  {
    key: "notif_saved_search_match",
    label: "Nouvelle annonce correspondant a ta recherche favoris",
  },
  { key: "notif_new_followers", label: "Nouveaux abonnes a ton compte" },
  {
    key: "notif_following_new_listing",
    label: "Nouvelle annonce de membres que tu suis",
  },
  { key: "notif_new_sale", label: "Nouvel achat sur une de tes annonces" },
  { key: "notif_new_payment", label: "Nouveau paiement" },
] as const;

const NOTIF_STORAGE_PREFIX = "profile_pref_";

export function NotificationSettingsClient() {
  const [notifState, setNotifState] = useState<Record<string, boolean>>({});
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  const enablePushNotifications = useCallback(async () => {
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (!vapidPublic) {
      toast.error("Notifications Push non configurées.");
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      toast.error("Notifications non supportées par ce navigateur.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast.error("Permission refusée.");
      return;
    }
    setIsEnablingPush(true);
    try {
      if (!navigator.serviceWorker.controller) {
        await navigator.serviceWorker.register("/sw.js");
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublic) as BufferSource,
      });
      const result = await savePushSubscriptionAction(sub.toJSON());
      if (result.ok) {
        setPushEnabled(true);
        toast.success("Notifications Push activées.");
      } else {
        toast.error(result.error ?? "Erreur lors de l'activation.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erreur lors de l'activation.",
      );
    } finally {
      setIsEnablingPush(false);
    }
  }, []);

  const rows = useMemo(
    () =>
      NOTIFICATION_ITEMS.map((item) => ({
        ...item,
        value: notifState[item.key] ?? true,
      })),
    [notifState],
  );

  useEffect(() => {
    const nextState: Record<string, boolean> = {};
    for (const item of NOTIFICATION_ITEMS) {
      const stored = localStorage.getItem(`${NOTIF_STORAGE_PREFIX}${item.key}`);
      nextState[item.key] = stored === null ? true : stored === "1";
    }
    setNotifState(nextState);
  }, []);

  const onToggle = (key: string, nextValue: boolean) => {
    setNotifState((prev) => ({ ...prev, [key]: nextValue }));
    localStorage.setItem(`${NOTIF_STORAGE_PREFIX}${key}`, nextValue ? "1" : "0");
  };

  return (
    <div className="space-y-4">
      <div className="divide-border/60 divide-y rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium">Notifications Push</p>
            <p className="text-muted-foreground text-xs">
              Recevez des notifications sur vos appareils quand vous avez un nouveau message.
            </p>
          </div>
          <Button
            type="button"
            variant={pushEnabled ? "secondary" : "default"}
            size="sm"
            onClick={enablePushNotifications}
            disabled={isEnablingPush}
          >
            {isEnablingPush ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Bell className="mr-1 size-4" />
                {pushEnabled ? "Activées" : "Activer"}
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="divide-border/60 divide-y rounded-lg border p-4">
        <p className="text-muted-foreground mb-3 text-xs">
          Préférences par type de notification (stockées localement)
        </p>
      {rows.map((item) => (
        <div key={item.key} className="flex items-center justify-between gap-3 py-3">
          <p className="text-sm">{item.label}</p>
          <button
            type="button"
            role="switch"
            aria-checked={item.value}
            aria-label={item.label}
            onClick={() => onToggle(item.key, !item.value)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              item.value ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                item.value ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      ))}
      </div>
    </div>
  );
}
