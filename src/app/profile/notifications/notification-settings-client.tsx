"use client";

import { useEffect, useMemo, useState } from "react";

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
    <div className="divide-border/60 divide-y">
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
  );
}
