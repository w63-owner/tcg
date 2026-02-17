import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError, logInfo } from "@/lib/observability";

export const runtime = "nodejs";

type TransactionRow = {
  id: string;
  listing_id: string;
  seller_id: string;
  total_amount: number;
  fee_amount: number;
  shipping_cost: number;
};

type WalletRow = {
  user_id: string;
  pending_balance: number;
  available_balance: number;
  currency: string;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  return new Stripe(secretKey);
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

async function markPaid(transactionId: string, sessionId: string) {
  const admin = createAdminClient();
  const { data: tx } = await admin
    .from("transactions")
    .update({
      status: "PAID",
      stripe_checkout_session_id: sessionId,
    })
    .eq("id", transactionId)
    .eq("status", "PENDING_PAYMENT")
    .select("id, listing_id, seller_id, total_amount, fee_amount, shipping_cost")
    .maybeSingle<TransactionRow>();

  if (!tx) {
    logInfo({
      event: "stripe_webhook_mark_paid_noop",
      context: { transactionId, sessionId },
    });
    return;
  }

  await admin
    .from("listings")
    .update({ status: "SOLD" })
    .eq("id", tx.listing_id)
    .in("status", ["LOCKED", "ACTIVE"]);

  const sellerNet = roundMoney(
    Number(tx.total_amount) - Number(tx.fee_amount) - Number(tx.shipping_cost),
  );
  const sellerCredit = Math.max(0, sellerNet);

  const { data: wallet } = await admin
    .from("wallets")
    .select("user_id, pending_balance, available_balance, currency")
    .eq("user_id", tx.seller_id)
    .maybeSingle<WalletRow>();

  if (!wallet) {
    await admin.from("wallets").insert({
      user_id: tx.seller_id,
      available_balance: 0,
      pending_balance: sellerCredit,
      currency: "EUR",
    });
    return;
  }

  await admin
    .from("wallets")
    .update({
      pending_balance: roundMoney(Number(wallet.pending_balance) + sellerCredit),
    })
    .eq("user_id", wallet.user_id);
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
  try {
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
      logError({
        event: "stripe_webhook_missing_signature_or_secret",
      });
      return NextResponse.json(
        { error: "Missing webhook signature or secret" },
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
          await markPaid(transactionId, session.id);
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
    logError({
      event: "stripe_webhook_processing_failed",
      message: error instanceof Error ? error.message : "unknown",
    });
    try {
      const admin = createAdminClient();
      await admin.rpc("log_ops_alert", {
        p_source: "stripe_webhook",
        p_message: error instanceof Error ? error.message : "unknown",
        p_metadata: { route: "/api/stripe/webhook" },
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
