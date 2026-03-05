"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { checkOrderPaymentStatus } from "./check-order-payment-status";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 90; // ~3 minutes max

type Props = { transactionId: string };

/**
 * Polls the order payment status. When the webhook has confirmed the payment (status "paid"),
 * refreshes the page so the server component re-renders with the success state.
 */
export function PollPaymentStatus({ transactionId }: Props) {
  const router = useRouter();
  const pollCountRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > MAX_POLLS) {
        clearInterval(interval);
        return;
      }
      const result = await checkOrderPaymentStatus(transactionId);
      if (result?.paymentStatus === "paid") {
        clearInterval(interval);
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [transactionId, router]);

  return null;
}
