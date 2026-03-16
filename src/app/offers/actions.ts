"use server";

import Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequiredEnvVar } from "@/lib/env";
import { logError, logInfo } from "@/lib/observability";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import {
  calculateFeeAmount,
  inferSellerNetFromDisplayed,
} from "@/lib/pricing";
import { resolveShippingCost } from "@/lib/shipping/calculate-cost";
import { createStripeCheckoutSession } from "@/lib/stripe/checkout";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function respondToOfferAction(formData: FormData) {
  const offerId = String(formData.get("offer_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();

  if (!offerId || !["ACCEPTED", "REJECTED"].includes(decision)) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logInfo({ event: "offer_respond_unauthorized_attempt", context: { offerId } });
    return;
  }

  const { data: offer } = await supabase
    .from("offers")
    .select("id, listing_id, conversation_id, status, listing:listings!inner(seller_id)")
    .eq("id", offerId)
    .maybeSingle<{
      id: string;
      listing_id: string;
      conversation_id: string | null;
      status: string;
      listing: { seller_id: string };
    }>();

  if (!offer || offer.listing.seller_id !== user.id || offer.status !== "PENDING") {
    return;
  }

  await supabase
    .from("offers")
    .update({ status: decision })
    .eq("id", offer.id)
    .eq("status", "PENDING");

  if (decision === "ACCEPTED") {
    await supabase
      .from("offers")
      .update({ status: "REJECTED" })
      .eq("listing_id", offer.listing_id)
      .eq("status", "PENDING")
      .neq("id", offer.id);

    const { data: fullOffer } = await supabase
      .from("offers")
      .select("id, listing_id, buyer_id, offer_amount, conversation_id")
      .eq("id", offer.id)
      .single<{
        id: string;
        listing_id: string;
        buyer_id: string;
        offer_amount: number;
        conversation_id: string | null;
      }>();

    if (fullOffer) {
      await supabase
        .from("listings")
        .update({
          status: "RESERVED",
          reserved_for: fullOffer.buyer_id,
          reserved_price: fullOffer.offer_amount,
        })
        .eq("id", fullOffer.listing_id)
        .in("status", ["ACTIVE"]);
    }

    const { data: convId } = await supabase.rpc("ensure_conversation_for_offer", {
      p_offer_id: offer.id,
    });
    const conversationId = convId as string | null;

    if (conversationId && fullOffer) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: "Offre acceptée",
        message_type: "system",
        metadata: {
          type: "offer_accepted",
          offer_amount: fullOffer.offer_amount,
        },
      });
    }

    logInfo({
      event: "offer_accepted_conversation_ensured",
      context: { offerId: offer.id, listingId: offer.listing_id, sellerId: user.id },
    });
  }

  revalidatePath("/offers");
  revalidatePath(`/listing/${offer.listing_id}`);
  revalidatePath("/messages");
  if (offer?.conversation_id) {
    revalidatePath(`/messages/${offer.conversation_id}`);
  }
}

export async function cancelSentOfferAction(formData: FormData) {
  const offerId = String(formData.get("offer_id") ?? "").trim();
  if (!offerId) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logInfo({ event: "offer_cancel_unauthorized_attempt", context: { offerId } });
    return;
  }

  const { data: offer } = await supabase
    .from("offers")
    .select("id, listing_id, status, conversation_id, listing:listings!inner(seller_id)")
    .eq("id", offerId)
    .eq("buyer_id", user.id)
    .in("status", ["PENDING", "ACCEPTED"])
    .maybeSingle<{
      id: string;
      listing_id: string;
      status: string;
      conversation_id: string | null;
      listing: { seller_id: string };
    }>();

  if (!offer) {
    return;
  }

  const admin = createAdminClient();

  await admin
    .from("offers")
    .update({ status: "CANCELLED" })
    .eq("id", offerId)
    .eq("buyer_id", user.id)
    .in("status", ["PENDING", "ACCEPTED"]);

  if (offer.status === "ACCEPTED") {
    // Listing can be RESERVED (not yet started checkout) or LOCKED (started checkout then came back)
    const { data: staleTx } = await admin
      .from("transactions")
      .select("id")
      .eq("listing_id", offer.listing_id)
      .eq("buyer_id", user.id)
      .eq("status", "PENDING_PAYMENT")
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (staleTx) {
      await supabase.rpc("cancel_pending_transaction_and_unlock_listing", {
        p_transaction_id: staleTx.id,
      });
    }

    await admin
      .from("listings")
      .update({
        status: "ACTIVE",
        reserved_for: null,
        reserved_price: null,
      })
      .eq("id", offer.listing_id)
      .in("status", ["RESERVED", "LOCKED"]);

    // If listing was LOCKED, the RPC already set it to ACTIVE but did not clear reserved_*; clear them now
    await admin
      .from("listings")
      .update({ reserved_for: null, reserved_price: null })
      .eq("id", offer.listing_id);

    let conversationId = offer.conversation_id;
    if (!conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", offer.listing_id)
        .eq("buyer_id", user.id)
        .eq("seller_id", offer.listing.seller_id)
        .maybeSingle<{ id: string }>();
      conversationId = conv?.id ?? null;
    }

    if (conversationId) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: "Offre annulée par l'acheteur",
        message_type: "system",
        metadata: { type: "offer_cancelled_by_buyer" },
      });
    }

    revalidatePath(`/listing/${offer.listing_id}`);
    revalidatePath("/messages");
    if (offer.conversation_id) {
      revalidatePath(`/messages/${offer.conversation_id}`);
    }
  }

  revalidatePath("/offers");
}

/**
 * Cancel an existing PENDING_PAYMENT transaction for a LOCKED listing so the
 * buyer can start a fresh checkout.  Also expires the old Stripe session to
 * prevent stale payments.
 */
async function cancelStaleTransaction(
  supabase: SupabaseClient,
  listingId: string,
  buyerId: string,
): Promise<boolean> {
  const admin = createAdminClient();

  const { data: staleTx } = await admin
    .from("transactions")
    .select("id, stripe_checkout_session_id")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .eq("status", "PENDING_PAYMENT")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; stripe_checkout_session_id: string | null }>();

  if (!staleTx) return false;

  if (staleTx.stripe_checkout_session_id) {
    try {
      const stripe = new Stripe(getRequiredEnvVar("STRIPE_SECRET_KEY"));
      await stripe.checkout.sessions.expire(staleTx.stripe_checkout_session_id);
    } catch (err) {
      logInfo({
        event: "offer_checkout_expire_stale_session_skipped",
        context: {
          sessionId: staleTx.stripe_checkout_session_id,
          reason: err instanceof Error ? err.message : "unknown",
        },
      });
    }
  }

  await supabase.rpc("cancel_pending_transaction_and_unlock_listing", {
    p_transaction_id: staleTx.id,
  });

  logInfo({
    event: "offer_checkout_stale_transaction_cancelled",
    context: { transactionId: staleTx.id, listingId, buyerId },
  });

  return true;
}

type OfferCheckoutListing = {
  id: string;
  title: string;
  seller_id: string;
  status: string;
  delivery_weight_class: string;
  reserved_for: string | null;
};

type OfferCheckoutRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  offer_amount: number;
  status: string;
  listing: OfferCheckoutListing | Array<OfferCheckoutListing> | null;
};

type CheckoutLockResult = {
  transaction_id: string;
};

export async function startOfferCheckoutAction(formData: FormData) {
  const offerId = String(formData.get("offer_id") ?? "").trim();
  const returnConversationId = String(formData.get("return_conversation_id") ?? "").trim();
  if (!offerId) {
    redirect("/offers?error=invalid_offer");
  }

  const fallbackPath = returnConversationId
    ? `/messages/${returnConversationId}`
    : "/offers";
  const errorRedirect = (error: string, detail?: string) => {
    const base = `${fallbackPath}${fallbackPath.includes("?") ? "&" : "?"}error=${error}`;
    if (detail && process.env.NODE_ENV === "development") {
      return redirect(`${base}&error_detail=${encodeURIComponent(detail)}`);
    }
    return redirect(base);
  };

  const { supabase, user } = await requireAuthenticatedUser("/offers");

  const { data: offer } = await supabase
    .from("offers")
    .select(
      "id, listing_id, buyer_id, offer_amount, status, conversation_id, listing:listings(id, title, seller_id, status, delivery_weight_class, reserved_for)",
    )
    .eq("id", offerId)
    .maybeSingle<OfferCheckoutRow & { conversation_id: string | null }>();

  const listingRow = offer?.listing;
  const listing = Array.isArray(listingRow) ? listingRow[0] : listingRow ?? null;
  if (!offer || !listing) {
    errorRedirect("offer_not_found");
    return;
  }

  if (offer.buyer_id !== user.id) {
    errorRedirect("forbidden");
    return;
  }
  if (offer.status !== "ACCEPTED") {
    errorRedirect("offer_not_accepted");
    return;
  }

  // If the listing is LOCKED by a previous checkout attempt from this buyer,
  // cancel the stale transaction so we can start a fresh checkout.
  if (listing.status === "LOCKED") {
    const cancelled = await cancelStaleTransaction(supabase, listing.id, user.id);
    if (cancelled) {
      listing.status = "ACTIVE";
    }
  }

  const listingAvailable =
    listing.status === "ACTIVE" ||
    (listing.status === "RESERVED" && listing.reserved_for === user.id);
  if (!listingAvailable) {
    errorRedirect("listing_not_available");
    return;
  }

  const shippingCost = await resolveShippingCost({
    supabase,
    buyerId: user.id,
    sellerId: listing.seller_id,
    weightClass: listing.delivery_weight_class,
  });

  const displayedOffer = Number(offer.offer_amount);
  const inferredSellerNet = inferSellerNetFromDisplayed(displayedOffer);
  const feeAmount = calculateFeeAmount(displayedOffer, inferredSellerNet);
  const totalAmount = Math.round((displayedOffer + shippingCost) * 100) / 100;

  const { data: lockResult, error: lockError } = await supabase.rpc(
    "create_pending_transaction_and_lock_listing",
    {
      p_listing_id: listing.id,
      p_shipping_cost: shippingCost,
      p_fee_amount: feeAmount,
      p_total_amount: totalAmount,
    },
  );

  const lockRow = (lockResult?.[0] ?? null) as CheckoutLockResult | null;
  if (lockError || !lockRow) {
    logError({
      event: "offer_checkout_lock_failed",
      message: lockError?.message ?? "rpc failed",
      context: { offerId, userId: user.id },
    });
    errorRedirect("checkout_lock_failed");
    return;
  }

  const transactionId = lockRow.transaction_id;

  const buyerEmail = (user.email ?? "").trim();
  if (!buyerEmail) {
    await supabase.rpc("cancel_pending_transaction_and_unlock_listing", {
      p_transaction_id: transactionId,
    });
    errorRedirect("email_required");
    return;
  }

  const cancelPath = returnConversationId
    ? `/messages/${returnConversationId}`
    : (offer.conversation_id
        ? `/messages/${offer.conversation_id}`
        : "/offers?checkout=cancelled");

  try {
    const session = await createStripeCheckoutSession({
      title: listing.title,
      totalAmount,
      transactionId,
      cancelPath,
      description: `Accepted offer ${offer.id} - tx ${transactionId}`,
      metadata: {
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
        offer_id: offer.id,
      },
      buyerId: user.id,
      buyerEmail,
      feeAmount,
      shippingCost,
    });

    if (!session.url) {
      await supabase.rpc("cancel_pending_transaction_and_unlock_listing", {
        p_transaction_id: transactionId,
      });
      logError({
        event: "offer_checkout_stripe_session_failed",
        context: { offerId, transactionId, userId: user.id },
      });
      errorRedirect("stripe_session_failed");
      return;
    }

    await supabase.rpc("attach_checkout_session_to_transaction", {
      p_transaction_id: transactionId,
      p_session_id: session.id,
    });
    logInfo({
      event: "offer_checkout_session_created",
      context: { offerId, transactionId, sessionId: session.id, userId: user.id },
    });

    redirect(session.url);
  } catch (err) {
    const isRedirect =
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest?: string }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT");
    if (isRedirect) {
      throw err;
    }
    await supabase.rpc("cancel_pending_transaction_and_unlock_listing", {
      p_transaction_id: transactionId,
    });
    const message = err instanceof Error ? err.message : String(err);
    logError({
      event: "offer_checkout_stripe_exception",
      message,
      context: {
        offerId,
        transactionId,
        userId: user.id,
        stack: err instanceof Error ? err.stack : undefined,
      },
    });
    errorRedirect("stripe_session_exception", message);
  }
}
