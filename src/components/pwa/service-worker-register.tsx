"use client";

import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ServiceWorkerRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(
    null,
  );

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Dev chunks change often; unregister SW + clear its caches to avoid stale runtime assets.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys
            .filter((key) => key.startsWith("pokemon-market-"))
            .forEach((key) => {
              caches.delete(key);
            });
        });
      }
      return;
    }

    let mounted = true;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (!mounted) return;
        setRegistration(reg);

        if (reg.waiting) {
          setUpdateReady(true);
        }

        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        // Silent fail: PWA remains optional.
      });

    return () => {
      mounted = false;
    };
  }, []);

  const onRefresh = () => {
    if (!registration?.waiting) return;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  };

  if (!updateReady) return null;

  return (
    <div className="fixed right-3 bottom-[calc(8rem+var(--safe-area-bottom))] z-50 md:bottom-6">
      <Button onClick={onRefresh} className="rounded-full shadow-lg">
        <RefreshCcw className="mr-1 h-4 w-4" />
        Mettre a jour l&apos;app
      </Button>
    </div>
  );
}
