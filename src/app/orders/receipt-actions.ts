"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError, logInfo } from "@/lib/observability";
import { sendSellerReceiptConfirmedEmail } from "@/lib/emails/send-receipt-confirmed";
import { sendDisputeOpenedEmails } from "@/lib/emails/send-dispute-opened";

const DISPUTE_SYSTEM_MESSAGE =
  "⚠️ Un litige a été ouvert. Le support administrateur va intervenir.";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export type ConfirmReceiptResult = { ok: boolean; error?: string };

export async function confirmReceiptAction(
  transactionId: string,
  rating: number,
  comment: string | null,
): Promise<ConfirmReceiptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Non connecté." };
  }

  const { data: tx } = await supabase
    .from("transactions")
    .select("id, buyer_id, seller_id, listing_id, total_amount, fee_amount, status")
    .eq("id", transactionId)
    .eq("buyer_id", user.id)
    .eq("status", "SHIPPED")
    .maybeSingle<{
      id: string;
      buyer_id: string;
      seller_id: string;
      listing_id: string;
      total_amount: number;
      fee_amount: number;
      status: string;
    }>();

  if (!tx) {
    return { ok: false, error: "Transaction introuvable ou déjà traitée." };
  }

  const ratingNum = Number(rating);
  if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return { ok: false, error: "Note invalide (1 à 5)." };
  }

  const admin = createAdminClient();
  const sellerCredit = roundMoney(
    Math.max(0, Number(tx.total_amount) - Number(tx.fee_amount)),
  );

  const { error: updateTxError } = await admin
    .from("transactions")
    .update({ status: "COMPLETED" })
    .eq("id", transactionId)
    .eq("status", "SHIPPED");

  if (updateTxError) {
    logError({
      event: "receipt_confirm_transaction_update_failed",
      message: updateTxError.message,
      context: { transactionId },
    });
    return { ok: false, error: "Impossible de finaliser la commande." };
  }

  const { data: wallet } = await admin
    .from("wallets")
    .select("user_id, pending_balance, available_balance")
    .eq("user_id", tx.seller_id)
    .maybeSingle<{ user_id: string; pending_balance: number; available_balance: number }>();

  if (wallet) {
    const newPending = roundMoney(Math.max(0, Number(wallet.pending_balance) - sellerCredit));
    const newAvailable = roundMoney(Number(wallet.available_balance) + sellerCredit);
    const { error: walletError } = await admin
      .from("wallets")
      .update({
        pending_balance: newPending,
        available_balance: newAvailable,
      })
      .eq("user_id", tx.seller_id);

    if (walletError) {
      logError({
        event: "receipt_confirm_wallet_update_failed",
        message: walletError.message,
        context: { transactionId, sellerId: tx.seller_id },
      });
      return { ok: false, error: "Erreur lors du déblocage des fonds." };
    }
  }

  const { error: reviewError } = await admin.from("reviews").insert({
    transaction_id: transactionId,
    reviewer_id: tx.buyer_id,
    reviewee_id: tx.seller_id,
    rating: Math.round(ratingNum),
    comment: comment?.trim().slice(0, 2000) || null,
  });

  if (reviewError) {
    logError({
      event: "receipt_confirm_review_insert_failed",
      message: reviewError.message,
      context: { transactionId },
    });
    return { ok: false, error: "Commande finalisée mais l'avis n'a pas été enregistré." };
  }

  await sendSellerReceiptConfirmedEmail({
    transactionId,
    sellerId: tx.seller_id,
    cardName: await getListingTitle(admin, tx.listing_id),
    rating: Math.round(ratingNum),
    hasComment: Boolean(comment?.trim()),
  }).catch((err) => {
    logError({
      event: "receipt_confirm_email_failed",
      message: err instanceof Error ? err.message : String(err),
      context: { transactionId },
    });
  });

  logInfo({
    event: "receipt_confirmed",
    context: { transactionId, sellerId: tx.seller_id },
  });

  // Insert system message in conversation: sale completed (buyer) / balance credited (seller)
  try {
    const { data: conversationId, error: rpcError } = await admin.rpc(
      "ensure_conversation_for_users",
      {
        p_listing_id: tx.listing_id,
        p_buyer_id: tx.buyer_id,
        p_seller_id: tx.seller_id,
      },
    );
    if (!rpcError && conversationId) {
      const saleCompletedContent = JSON.stringify({
        type: "sale_completed",
        seller_credit: sellerCredit,
      });
      await admin.from("messages").insert({
        conversation_id: conversationId,
        sender_id: tx.buyer_id,
        message_type: "system",
        content: saleCompletedContent,
      });
      revalidatePath("/messages");
      revalidatePath(`/messages/${conversationId}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logError({
      event: "receipt_confirm_sale_completed_message_failed",
      message,
      context: { transactionId },
    });
  }

  revalidatePath("/messages");
  revalidatePath("/profile/sales");
  return { ok: true };
}

async function getListingTitle(
  admin: ReturnType<typeof createAdminClient>,
  listingId: string,
): Promise<string> {
  const { data } = await admin
    .from("listings")
    .select("title")
    .eq("id", listingId)
    .maybeSingle<{ title: string }>();
  return data?.title ?? "Annonce";
}

export type DisputeReason = "DAMAGED_CARD" | "WRONG_CARD" | "EMPTY_PACKAGE" | "OTHER";

export type OpenDisputeResult = { ok: boolean; error?: string };

export async function openDisputeAction(
  transactionId: string,
  reason: DisputeReason,
  description: string,
): Promise<OpenDisputeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Non connecté." };
  }

  const descTrimmed = description.trim();
  if (descTrimmed.length < 10) {
    return { ok: false, error: "Merci de décrire le problème (au moins 10 caractères)." };
  }

  const { data: tx } = await supabase
    .from("transactions")
    .select("id, buyer_id, seller_id, listing_id, status")
    .eq("id", transactionId)
    .eq("buyer_id", user.id)
    .eq("status", "SHIPPED")
    .maybeSingle<{
      id: string;
      buyer_id: string;
      seller_id: string;
      listing_id: string;
      status: string;
    }>();

  if (!tx) {
    return { ok: false, error: "Transaction introuvable ou déjà traitée." };
  }

  const admin = createAdminClient();

  const { error: updateTxError } = await admin
    .from("transactions")
    .update({ status: "DISPUTED" })
    .eq("id", transactionId)
    .eq("status", "SHIPPED");

  if (updateTxError) {
    logError({
      event: "dispute_open_transaction_update_failed",
      message: updateTxError.message,
      context: { transactionId },
    });
    return { ok: false, error: "Impossible d'ouvrir le litige." };
  }

  const { error: disputeError } = await admin.from("disputes").insert({
    transaction_id: transactionId,
    opened_by: tx.buyer_id,
    reason,
    description: descTrimmed.slice(0, 5000),
    status: "OPEN",
  });

  if (disputeError) {
    logError({
      event: "dispute_open_insert_failed",
      message: disputeError.message,
      context: { transactionId },
    });
    return { ok: false, error: "Erreur lors de l'enregistrement du litige." };
  }

  const { data: conv } = await admin
    .from("conversations")
    .select("id")
    .eq("listing_id", tx.listing_id)
    .eq("buyer_id", tx.buyer_id)
    .eq("seller_id", tx.seller_id)
    .maybeSingle<{ id: string }>();

  if (conv) {
    await admin.from("messages").insert({
      conversation_id: conv.id,
      sender_id: tx.buyer_id,
      content: DISPUTE_SYSTEM_MESSAGE,
      message_type: "system",
    });
  }

  const cardName = await getListingTitle(admin, tx.listing_id);
  await sendDisputeOpenedEmails({
    transactionId,
    sellerId: tx.seller_id,
    buyerId: tx.buyer_id,
    reason,
    description: descTrimmed,
    cardName,
  }).catch((err) => {
    logError({
      event: "dispute_opened_email_failed",
      message: err instanceof Error ? err.message : String(err),
      context: { transactionId },
    });
  });

  logInfo({
    event: "dispute_opened",
    context: { transactionId, openedBy: tx.buyer_id },
  });

  revalidatePath("/messages");
  revalidatePath(`/messages/${conv?.id ?? ""}`);
  return { ok: true };
}
