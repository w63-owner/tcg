import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequiredEnvVar } from "@/lib/env";
import { logError, logInfo } from "@/lib/observability";
import { sendTransactionEmails } from "@/lib/emails/send-transaction-emails";

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

/**
 * Post-payment: mark transaction PAID, listing SOLD, credit seller pending_balance.
 * Seller receives: total_amount - fee_amount (i.e. card price + shipping; fee is platform).
 */
async function markPaid(transactionId: string, sessionId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: tx, error: updateTxError } = await admin
    .from("transactions")
    .update({
      status: "PAID",
      stripe_checkout_session_id: sessionId,
    })
    .eq("id", transactionId)
    .eq("status", "PENDING_PAYMENT")
    .select("id, listing_id, seller_id, total_amount, fee_amount, shipping_cost")
    .maybeSingle<TransactionRow>();

  if (updateTxError) {
    logError({
      event: "stripe_webhook_mark_paid_transaction_update_failed",
      message: updateTxError.message,
      context: { transactionId, sessionId },
    });
    throw new Error(`Transaction update failed: ${updateTxError.message}`);
  }

  if (!tx) {
    logInfo({
      event: "stripe_webhook_mark_paid_noop",
      context: { transactionId, sessionId },
    });
    return;
  }

  const { error: listingError } = await admin
    .from("listings")
    .update({ status: "SOLD" })
    .eq("id", tx.listing_id)
    .in("status", ["LOCKED", "ACTIVE"]);

  if (listingError) {
    logError({
      event: "stripe_webhook_mark_paid_listing_update_failed",
      message: listingError.message,
      context: { transactionId, listingId: tx.listing_id, sessionId },
    });
    throw new Error(`Listing update failed: ${listingError.message}`);
  }

  const sellerCredit = roundMoney(
    Math.max(0, Number(tx.total_amount) - Number(tx.fee_amount)),
  );

  const { data: wallet } = await admin
    .from("wallets")
    .select("user_id, pending_balance, available_balance, currency")
    .eq("user_id", tx.seller_id)
    .maybeSingle<WalletRow>();

  if (!wallet) {
    const { error: insertWalletError } = await admin.from("wallets").insert({
      user_id: tx.seller_id,
      available_balance: 0,
      pending_balance: sellerCredit,
      currency: "EUR",
    });
    if (insertWalletError) {
      logError({
        event: "stripe_webhook_mark_paid_wallet_insert_failed",
        message: insertWalletError.message,
        context: { transactionId, sellerId: tx.seller_id, sessionId },
      });
      throw new Error(`Wallet insert failed: ${insertWalletError.message}`);
    }
    return;
  }

  const { error: walletError } = await admin
    .from("wallets")
    .update({
      pending_balance: roundMoney(Number(wallet.pending_balance) + sellerCredit),
    })
    .eq("user_id", wallet.user_id);

  if (walletError) {
    logError({
      event: "stripe_webhook_mark_paid_wallet_update_failed",
      message: walletError.message,
      context: { transactionId, sellerId: tx.seller_id, sessionId },
    });
    throw new Error(`Wallet update failed: ${walletError.message}`);
  }
}

function formatStripeAddress(addr: Stripe.Address | null): string {
  if (!addr) return "Adresse non communiquée.";
  const parts = [
    addr.line1,
    addr.line2,
    [addr.postal_code, addr.city].filter(Boolean).join(" "),
    addr.state,
    addr.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : "Adresse non communiquée.";
}

/**
 * Sends buyer and seller transactional emails. Does not throw; logs errors so
 * payment confirmation is never blocked by email failures.
 */
/** Persist buyer shipping address on transaction when provided by Stripe (for seller sale detail page). */
async function persistShippingAddressIfPresent(
  transactionId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const addr = session.customer_details?.address;
  if (!addr?.line1 && !addr?.postal_code) return;
  const admin = createAdminClient();
  await admin
    .from("transactions")
    .update({
      shipping_address_line: addr.line1 ?? null,
      shipping_address_city: addr.city ?? null,
      shipping_address_postcode: addr.postal_code ?? null,
    })
    .eq("id", transactionId)
    .eq("status", "PAID");
}

async function sendTransactionEmailsIfPaid(
  transactionId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  try {
    await persistShippingAddressIfPresent(transactionId, session);
    const admin = createAdminClient();
    const { data: row } = await admin
      .from("transactions")
      .select("id, total_amount, buyer_id, seller_id, listing:listings(title)")
      .eq("id", transactionId)
      .eq("status", "PAID")
      .maybeSingle<{
        id: string;
        total_amount: number;
        buyer_id: string;
        seller_id: string;
        listing: { title: string } | { title: string }[] | null;
      }>();

    if (!row) return;

    const listing = Array.isArray(row.listing) ? row.listing[0] : row.listing;
    const cardName = listing?.title ?? "Annonce";
    const totalAmountFormatted = `${Number(row.total_amount).toFixed(2)} €`;
    const shippingAddressFormatted = formatStripeAddress(
      session.customer_details?.address ?? null,
    );

    let buyerEmail: string | null = session.customer_details?.email ?? null;
    if (!buyerEmail) {
      const { data: buyerUser } = await admin.auth.admin.getUserById(row.buyer_id);
      buyerEmail = buyerUser?.user?.email ?? null;
    }
    const { data: sellerUser } = await admin.auth.admin.getUserById(row.seller_id);
    const sellerEmail = sellerUser?.user?.email ?? null;

    if (!buyerEmail || !sellerEmail) {
      logInfo({
        event: "transaction_emails_skipped_missing_email",
        context: { transactionId, hasBuyerEmail: !!buyerEmail, hasSellerEmail: !!sellerEmail },
      });
      return;
    }

    const result = await sendTransactionEmails({
      buyerEmail,
      sellerEmail,
      cardName,
      totalAmountFormatted,
      transactionId: row.id,
      shippingAddressFormatted,
    });

    if (!result.sent && result.error) {
      logError({
        event: "transaction_emails_after_paid_failed",
        message: result.error,
        context: { transactionId },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    logError({
      event: "transaction_emails_after_paid_exception",
      message,
      context: { transactionId },
    });
  }
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
          await markPaid(transactionId, session.id);
          await sendTransactionEmailsIfPaid(transactionId, session);
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
