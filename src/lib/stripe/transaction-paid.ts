import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequiredEnvVar } from "@/lib/env";
import { logError, logInfo } from "@/lib/observability";
import { sendTransactionEmails } from "@/lib/emails/send-transaction-emails";

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
 * Marks transaction as PAID, listing as SOLD, credits seller wallet.
 * Idempotent: no-op if transaction is already PAID.
 */
export async function markPaid(
  transactionId: string,
  sessionId: string,
): Promise<void> {
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
      event: "stripe_mark_paid_transaction_update_failed",
      message: updateTxError.message,
      context: { transactionId, sessionId },
    });
    throw new Error(`Transaction update failed: ${updateTxError.message}`);
  }

  if (!tx) {
    logInfo({
      event: "stripe_mark_paid_noop",
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
      event: "stripe_mark_paid_listing_update_failed",
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
        event: "stripe_mark_paid_wallet_insert_failed",
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
      event: "stripe_mark_paid_wallet_update_failed",
      message: walletError.message,
      context: { transactionId, sellerId: tx.seller_id, sessionId },
    });
    throw new Error(`Wallet update failed: ${walletError.message}`);
  }
}

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

export async function sendTransactionEmailsIfPaid(
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

export async function ensureTransactionConversation(
  transactionId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: tx, error: txError } = await admin
      .from("transactions")
      .select("listing_id, buyer_id, seller_id, updated_at, total_amount")
      .eq("id", transactionId)
      .eq("status", "PAID")
      .maybeSingle<{
        listing_id: string;
        buyer_id: string;
        seller_id: string;
        updated_at: string;
        total_amount: number;
      }>();

    if (txError || !tx) {
      logError({
        event: "ensure_transaction_conversation_tx_fetch_failed",
        message: txError?.message ?? "transaction not found or not PAID",
        context: { transactionId },
      });
      return;
    }

    const { data: conversationId, error: rpcError } = await admin.rpc(
      "ensure_conversation_for_users",
      {
        p_listing_id: tx.listing_id,
        p_buyer_id: tx.buyer_id,
        p_seller_id: tx.seller_id,
      },
    );

    if (rpcError || !conversationId) {
      logError({
        event: "ensure_transaction_conversation_rpc_failed",
        message: rpcError?.message ?? "no conversation id returned",
        context: { transactionId },
      });
      return;
    }

    const paymentMessageContent = JSON.stringify({
      type: "payment_completed",
      total_amount: Number(tx.total_amount),
    });

    const { error: insertError } = await admin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: tx.buyer_id,
      message_type: "system",
      content: paymentMessageContent,
    });

    if (insertError) {
      logError({
        event: "ensure_transaction_conversation_message_insert_failed",
        message: insertError.message,
        context: { transactionId, conversationId },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    logError({
      event: "ensure_transaction_conversation_exception",
      message,
      context: { transactionId },
    });
  }
}

/**
 * Applies full "payment confirmed" flow: mark PAID, send emails, ensure conversation.
 * Used by the webhook and by the success-page sync when the webhook was not received (e.g. local dev).
 */
export async function applyPaidCheckoutSession(
  transactionId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  await markPaid(transactionId, session.id);
  await sendTransactionEmailsIfPaid(transactionId, session);
  await ensureTransactionConversation(transactionId);
}
