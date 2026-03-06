"use server";

import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getRequiredEnvVar } from "@/lib/env";
import { applyPaidCheckoutSession } from "@/lib/stripe/transaction-paid";
import { logError, logInfo } from "@/lib/observability";

/**
 * Returns the payment status for the given transaction if the current user is the buyer.
 * Used by the success page to poll until the webhook has confirmed the payment.
 * If the transaction is still PENDING_PAYMENT and has a Stripe session id, tries to sync
 * from Stripe (so the page works even when the webhook was not received, e.g. local dev).
 */
export async function checkOrderPaymentStatus(
  transactionId: string,
): Promise<{ paymentStatus: "paid" | "pending" } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row, error } = await supabase
    .from("transactions")
    .select("id, buyer_id, status, stripe_checkout_session_id")
    .eq("id", transactionId)
    .in("status", ["PAID", "PENDING_PAYMENT"])
    .maybeSingle<{
      id: string;
      buyer_id: string;
      status: string;
      stripe_checkout_session_id: string | null;
    }>();

  if (error || !row || row.buyer_id !== user.id) return null;

  if (row.status === "PAID") {
    return { paymentStatus: "paid" };
  }

  if (row.stripe_checkout_session_id) {
    try {
      const stripe = new Stripe(getRequiredEnvVar("STRIPE_SECRET_KEY"));
      const session = await stripe.checkout.sessions.retrieve(
        row.stripe_checkout_session_id,
      );
      if (session.payment_status === "paid") {
        logInfo({
          event: "order_success_sync_from_stripe",
          context: { transactionId },
        });
        await applyPaidCheckoutSession(transactionId, session);
        return { paymentStatus: "paid" };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      logError({
        event: "order_success_sync_from_stripe_failed",
        message,
        context: { transactionId },
      });
    }
  }

  return { paymentStatus: "pending" };
}
