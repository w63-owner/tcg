"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";

const TRIGGER_DISTANCE = 84;
const MAX_PULL = 128;

export function PullToRefresh() {
  const router = useRouter();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      if (isRefreshing) return;
      if (window.scrollY > 0) return;
      startYRef.current = event.touches[0]?.clientY ?? null;
      pullingRef.current = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pullingRef.current || isRefreshing) return;
      const startY = startYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY == null || currentY == null) return;

      const delta = currentY - startY;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }

      if (window.scrollY <= 0) {
        event.preventDefault();
      }
      setPullDistance(Math.min(MAX_PULL, delta));
    };

    const reset = () => {
      pullingRef.current = false;
      startYRef.current = null;
      setPullDistance(0);
    };

    const onTouchEnd = () => {
      if (!pullingRef.current || isRefreshing) {
        reset();
        return;
      }

      if (pullDistance >= TRIGGER_DISTANCE) {
        setIsRefreshing(true);
        setPullDistance(TRIGGER_DISTANCE);
        router.refresh();
        window.setTimeout(() => {
          setIsRefreshing(false);
          reset();
        }, 700);
        return;
      }

      reset();
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [isRefreshing, pullDistance, router]);

  const visible = isRefreshing || pullDistance > 6;
  const ready = pullDistance >= TRIGGER_DISTANCE;

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center"
      style={{ top: Math.min(12 + pullDistance * 0.4, 48) }}
    >
      <div className="bg-background/95 border-border/60 flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm backdrop-blur">
        <RefreshCcw
          className={`h-4 w-4 ${
            isRefreshing ? "animate-spin" : ready ? "text-primary" : "text-muted-foreground"
          }`}
        />
        <span className="text-xs">
          {isRefreshing ? "Actualisation..." : ready ? "Relache pour actualiser" : "Tire pour actualiser"}
        </span>
      </div>
    </div>
  );
}
