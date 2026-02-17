"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import {
  calculateDisplayPrice,
  calculateFeeAmount,
} from "@/lib/pricing";
import { resolveShippingCost } from "@/lib/shipping/calculate-cost";
import { createStripeCheckoutSession } from "@/lib/stripe/checkout";
import type { OfferActionState } from "./offer-action-state";

type ListingRow = {
  id: string;
  title: string;
  seller_id: string;
  price_seller: number;
  display_price: number | null;
  delivery_weight_class: string;
  status: "DRAFT" | "ACTIVE" | "LOCKED" | "SOLD";
};

type CheckoutLockResult = {
  transaction_id: string;
  listing_id: string;
  seller_id: string;
  listing_title: string;
};

export async function startCheckoutAction(formData: FormData) {
  const listingId = String(formData.get("listing_id") ?? "").trim();
  if (!listingId) {
    redirect("/");
  }

  const { supabase, user } = await requireAuthenticatedUser(`/listing/${listingId}`);

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select(
      "id, title, seller_id, price_seller, display_price, delivery_weight_class, status",
    )
    .eq("id", listingId)
    .single<ListingRow>();

  if (listingError || !listing) {
    redirect("/?error=listing_not_found");
  }

  if (listing.seller_id === user.id) {
    redirect(`/listing/${listingId}?error=cannot_buy_own_listing`);
  }

  if (listing.status !== "ACTIVE") {
    redirect(`/listing/${listingId}?error=listing_not_available`);
  }

  const shippingCost = await resolveShippingCost({
    supabase,
    buyerId: user.id,
    sellerId: listing.seller_id,
    weightClass: listing.delivery_weight_class,
  });

  const displayPrice =
    listing.display_price ?? calculateDisplayPrice(Number(listing.price_seller));
  const feeAmount = calculateFeeAmount(displayPrice, Number(listing.price_seller));
  const totalAmount = Math.round((displayPrice + shippingCost) * 100) / 100;

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
    redirect(`/listing/${listingId}?error=listing_lock_failed`);
  }

  const transactionId = lockRow.transaction_id;

  try {
    const session = await createStripeCheckoutSession({
      title: listing.title,
      totalAmount,
      transactionId,
      cancelPath: `/listing/${listing.id}?checkout=cancelled`,
      metadata: {
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
      },
    });

    if (!session.url) {
      await supabase.rpc("cancel_pending_transaction_and_unlock_listing", {
        p_transaction_id: transactionId,
      });
      redirect(`/listing/${listingId}?error=stripe_session_failed`);
    }

    await supabase.rpc("attach_checkout_session_to_transaction", {
      p_transaction_id: transactionId,
      p_session_id: session.id,
    });

    redirect(session.url);
  } catch {
    await supabase.rpc("cancel_pending_transaction_and_unlock_listing", {
      p_transaction_id: transactionId,
    });
    redirect(`/listing/${listingId}?error=stripe_session_exception`);
  }
}

export async function submitOfferAction(
  _prevState: OfferActionState,
  formData: FormData,
): Promise<OfferActionState> {
  const listingId = String(formData.get("listing_id") ?? "").trim();
  const offerAmount = Number(formData.get("offer_amount") ?? 0);

  if (!listingId) {
    return { status: "error", message: "Annonce invalide." };
  }
  if (!Number.isFinite(offerAmount) || offerAmount <= 0) {
    return { status: "error", message: "Montant d'offre invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Connecte-toi pour faire une offre." };
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("seller_id")
    .eq("id", listingId)
    .single<{ seller_id: string }>();

  if (listing?.seller_id === user.id) {
    return {
      status: "error",
      message: "Tu ne peux pas faire une offre sur ta propre annonce.",
    };
  }

  const { error } = await supabase.from("offers").insert({
    listing_id: listingId,
    buyer_id: user.id,
    offer_amount: offerAmount,
    status: "PENDING",
  });

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  revalidatePath(`/listing/${listingId}`);
  return {
    status: "success",
    message: "Offre envoyee. Elle expirera dans 24h sans reponse.",
  };
}
