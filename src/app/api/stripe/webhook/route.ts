import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequiredEnvVar } from "@/lib/env";
import { logError, logInfo } from "@/lib/observability";
import {
  applyPaidCheckoutSession,
} from "@/lib/stripe/transaction-paid";

export const runtime = "nodejs";

// In local dev, Stripe cannot call this URL. Use: stripe listen --forward-to localhost:3000/api/stripe/webhook
// The order success page also syncs payment status from Stripe when polling, so the page can still show confirmed.

function getStripeClient() {
  return new Stripe(getRequiredEnvVar("STRIPE_SECRET_KEY"));
}

async function resolveTransactionId(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const metadataTx = session.metadata?.transaction_id;
  if (metadataTx) {
    return metadataTx;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("transactions")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle<{ id: string }>();

  return data?.id ?? null;
}

async function markCancelled(transactionId: string, sessionId: string) {
  const admin = createAdminClient();
  const { data: tx } = await admin
    .from("transactions")
    .update({
      status: "CANCELLED",
      stripe_checkout_session_id: sessionId,
    })
    .eq("id", transactionId)
    .eq("status", "PENDING_PAYMENT")
    .select("id, listing_id")
    .maybeSingle<{ id: string; listing_id: string }>();

  if (!tx) {
    logInfo({
      event: "stripe_webhook_mark_cancelled_noop",
      context: { transactionId, sessionId },
    });
    return;
  }

  await admin
    .from("listings")
    .update({ status: "ACTIVE" })
    .eq("id", tx.listing_id)
    .eq("status", "LOCKED");
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  let webhookSecret: string;
  try {
    webhookSecret = getRequiredEnvVar("STRIPE_WEBHOOK_SECRET");
  } catch {
    logError({
      event: "stripe_webhook_missing_secret",
      message: "STRIPE_WEBHOOK_SECRET is not set",
    });
    return NextResponse.json(
      { error: "Missing webhook secret configuration" },
      { status: 500 },
    );
  }

  if (!signature) {
    logError({ event: "stripe_webhook_missing_signature" });
    return NextResponse.json(
      { error: "Missing webhook signature" },
      { status: 400 },
    );
  }

  const payload = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    logError({
      event: "stripe_webhook_signature_invalid",
      message: error instanceof Error ? error.message : "invalid signature",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid webhook signature",
      },
      { status: 400 },
    );
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      logInfo({
        event: "stripe_webhook_received_paid_event",
        context: { eventType: event.type, sessionId: session.id },
      });
      if (session.payment_status === "paid") {
        const transactionId = await resolveTransactionId(session);
        if (transactionId) {
          await applyPaidCheckoutSession(transactionId, session);
        }
      }
    }

    if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      logInfo({
        event: "stripe_webhook_received_cancel_event",
        context: { eventType: event.type, sessionId: session.id },
      });
      const transactionId = await resolveTransactionId(session);
      if (transactionId) {
        await markCancelled(transactionId, session.id);
      }
    }

    logInfo({
      event: "stripe_webhook_processed",
      context: { eventType: event.type, eventId: event.id },
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    logError({
      event: "stripe_webhook_processing_failed",
      message,
      context: { eventType: event.type, eventId: event.id },
    });
    try {
      const admin = createAdminClient();
      await admin.rpc("log_ops_alert", {
        p_source: "stripe_webhook",
        p_message: message,
        p_metadata: { route: "/api/stripe/webhook", eventType: event.type },
        p_severity: "error",
      });
    } catch {
      // noop
    }
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
