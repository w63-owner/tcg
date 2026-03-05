"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logError, logInfo } from "@/lib/observability";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import {
  calculateFeeAmount,
  inferSellerNetFromDisplayed,
} from "@/lib/pricing";
import { resolveShippingCost } from "@/lib/shipping/calculate-cost";
import { createStripeCheckoutSession } from "@/lib/stripe/checkout";

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
        .eq("id", fullOffer.listing_id);
    }

    const { data: convId } = await supabase.rpc("ensure_conversation_for_offer", {
      p_offer_id: offer.id,
    });
    const conversationId = convId as string | null;

    if (conversationId && fullOffer) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: "Votre offre a été acceptée, vous pouvez passer au paiement.",
        message_type: "system",
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

  await supabase
    .from("offers")
    .update({ status: "CANCELLED" })
    .eq("id", offerId)
    .eq("buyer_id", user.id)
    .eq("status", "PENDING");

  revalidatePath("/offers");
}

type OfferCheckoutRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  offer_amount: number;
  status: string;
  listing: Array<{
    id: string;
    title: string;
    seller_id: string;
    status: string;
    delivery_weight_class: string;
    reserved_for: string | null;
  }> | null;
};

type CheckoutLockResult = {
  transaction_id: string;
};

export async function startOfferCheckoutAction(formData: FormData) {
  const offerId = String(formData.get("offer_id") ?? "").trim();
  if (!offerId) {
    redirect("/offers?error=invalid_offer");
  }

  const { supabase, user } = await requireAuthenticatedUser("/offers");

  const { data: offer } = await supabase
    .from("offers")
    .select(
      "id, listing_id, buyer_id, offer_amount, status, listing:listings(id, title, seller_id, status, delivery_weight_class, reserved_for)",
    )
    .eq("id", offerId)
    .maybeSingle<OfferCheckoutRow>();

  const listing = offer?.listing?.[0];
  if (!offer || !listing) {
    redirect("/offers?error=offer_not_found");
  }

  if (offer.buyer_id !== user.id) {
    redirect("/offers?error=forbidden");
  }
  if (offer.status !== "ACCEPTED") {
    redirect("/offers?error=offer_not_accepted");
  }
  const listingAvailable =
    listing.status === "ACTIVE" ||
    (listing.status === "RESERVED" && listing.reserved_for === user.id);
  if (!listingAvailable) {
    redirect("/offers?error=listing_not_available");
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
    redirect("/offers?error=checkout_lock_failed");
  }

  const transactionId = lockRow.transaction_id;

  try {
    const session = await createStripeCheckoutSession({
      title: listing.title,
      totalAmount,
      transactionId,
      cancelPath: "/offers?checkout=cancelled",
      description: `Accepted offer ${offer.id} - tx ${transactionId}`,
      metadata: {
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
        offer_id: offer.id,
      },
      buyerId: user.id,
      buyerEmail: user.email ?? "",
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
      redirect("/offers?error=stripe_session_failed");
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
  } catch {
    await supabase.rpc("cancel_pending_transaction_and_unlock_listing", {
      p_transaction_id: transactionId,
    });
    logError({
      event: "offer_checkout_stripe_exception",
      context: { offerId, transactionId, userId: user.id },
    });
    redirect("/offers?error=stripe_session_exception");
  }
}
