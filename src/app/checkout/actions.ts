"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import { logError, logInfo } from "@/lib/observability";
import {
  calculateDisplayPrice,
  calculateFeeAmount,
} from "@/lib/pricing";
import { resolveShippingCostByCountry } from "@/lib/shipping/calculate-cost";
import { createStripeCheckoutSession } from "@/lib/stripe/checkout";

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

export async function getShippingCostForCountry(
  listingId: string,
  destCountryCode: string
): Promise<{ shippingCost: number; error?: string }> {
  const { supabase, user } = await requireAuthenticatedUser(
    `/checkout/${listingId}`
  );

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, seller_id, delivery_weight_class, status")
    .eq("id", listingId)
    .single<ListingRow>();

  if (listingError || !listing) {
    return { shippingCost: 0, error: "Annonce introuvable." };
  }

  if (listing.seller_id === user.id) {
    return { shippingCost: 0, error: "Tu ne peux pas acheter ta propre annonce." };
  }

  if (listing.status !== "ACTIVE") {
    return { shippingCost: 0, error: "Annonce indisponible." };
  }

  const shippingCost = await resolveShippingCostByCountry({
    supabase,
    sellerId: listing.seller_id,
    destCountryCode: String(destCountryCode ?? "").trim(),
    weightClass: listing.delivery_weight_class,
  });

  return { shippingCost };
}

export async function createCheckoutSession(
  listingId: string,
  destCountryCode: string
): Promise<{ error?: string }> {
  const listingIdTrimmed = String(listingId ?? "").trim();
  const countryCode = String(destCountryCode ?? "").trim().toUpperCase().slice(0, 2);

  if (!listingIdTrimmed) {
    return { error: "Annonce invalide." };
  }

  const { supabase, user } = await requireAuthenticatedUser(
    `/checkout/${listingIdTrimmed}`
  );

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select(
      "id, title, seller_id, price_seller, display_price, delivery_weight_class, status",
    )
    .eq("id", listingIdTrimmed)
    .single<ListingRow>();

  if (listingError || !listing) {
    redirect("/?error=listing_not_found");
  }

  if (listing.seller_id === user.id) {
    redirect(`/listing/${listingIdTrimmed}?error=cannot_buy_own_listing`);
  }

  if (listing.status !== "ACTIVE") {
    redirect(`/listing/${listingIdTrimmed}?error=listing_not_available`);
  }

  // Update buyer profile country so shipping is consistent and saved for next time
  if (countryCode) {
    await supabase
      .from("profiles")
      .update({ country_code: countryCode })
      .eq("id", user.id);
  }

  const shippingCost = await resolveShippingCostByCountry({
    supabase,
    sellerId: listing.seller_id,
    destCountryCode: countryCode,
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
    logError({
      event: "checkout_lock_failed",
      message: lockError?.message ?? "rpc failed",
      context: { listingId: listingIdTrimmed, userId: user.id },
    });
    return {
      error: "Impossible de verrouiller l'annonce. Réessaie ou rafraîchis la page.",
    };
  }

  const transactionId = lockRow.transaction_id;

  try {
    const session = await createStripeCheckoutSession({
      title: listing.title,
      totalAmount,
      transactionId,
      cancelPath: `/checkout/${listingIdTrimmed}?cancelled=1`,
      metadata: {
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
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
      return { error: "Impossible d'ouvrir la session de paiement." };
    }

    await supabase.rpc("attach_checkout_session_to_transaction", {
      p_transaction_id: transactionId,
      p_session_id: session.id,
    });
    logInfo({
      event: "checkout_session_created",
      context: {
        listingId: listingIdTrimmed,
        transactionId,
        sessionId: session.id,
        userId: user.id,
      },
    });

    redirect(session.url);
  } catch (error) {
    // Next.js redirect() lance une exception pour déclencher la redirection : ne pas la traiter comme une erreur Stripe
    const maybeRedirect = error as { digest?: string };
    if (typeof maybeRedirect?.digest === "string" && maybeRedirect.digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }

    await supabase.rpc("cancel_pending_transaction_and_unlock_listing", {
      p_transaction_id: transactionId,
    });

    const message = error instanceof Error ? error.message : "unknown";
    const stripeCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : undefined;
    const stripeType =
      error && typeof error === "object" && "type" in error
        ? String((error as { type?: string }).type)
        : undefined;
    logError({
      event: "checkout_stripe_exception",
      message,
      context: {
        listingId: listingIdTrimmed,
        transactionId,
        userId: user.id,
        stripeCode,
        stripeType,
      },
    });

    if (message.includes("Missing required environment variable: STRIPE_SECRET_KEY")) {
      return { error: "Paiement indisponible: configuration manquante." };
    }
    if (message.includes("Invalid URL") || message.includes("url")) {
      return { error: "Paiement indisponible: URL de redirection invalide." };
    }
    if (stripeCode === "parameter_unknown" || message.includes("payment_intent_data")) {
      return { error: "Configuration Stripe incorrecte. Vérifie les paramètres du compte." };
    }

    // En développement, afficher l'erreur réelle dans le toast pour faciliter le debug
    if (process.env.NODE_ENV === "development" && message !== "unknown") {
      return {
        error: `Erreur Stripe: ${message}${stripeCode ? ` (code: ${stripeCode})` : ""}`,
      };
    }
    return { error: "Erreur Stripe. Réessaie dans quelques instants." };
  }
}
