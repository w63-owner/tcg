import Stripe from "stripe";
import { getRequiredEnvVar, getSiteUrl } from "@/lib/env";
import { getOrCreateStripeCustomerId } from "./customer";

function getStripeClient() {
  return new Stripe(getRequiredEnvVar("STRIPE_SECRET_KEY"));
}

export type StripeCheckoutParams = {
  title: string;
  totalAmount: number;
  transactionId: string;
  cancelPath: string;
  metadata: Record<string, string>;
  description?: string;
  /** Buyer Supabase user id (required for Stripe Customer lookup/creation). */
  buyerId: string;
  /** Buyer email (required when creating a new Stripe Customer). */
  buyerEmail: string;
  /** Platform fee amount (for session metadata / webhook). */
  feeAmount: number;
  /** Shipping cost (for session metadata / webhook). */
  shippingCost: number;
};

export async function createStripeCheckoutSession(params: StripeCheckoutParams) {
  const {
    title,
    totalAmount,
    transactionId,
    cancelPath,
    metadata,
    description,
    buyerId,
    buyerEmail,
    feeAmount,
    shippingCost,
  } = params;
  const siteUrl = getSiteUrl();
  const stripe = getStripeClient();

  const customerId = await getOrCreateStripeCustomerId(buyerId, buyerEmail);

  const sessionMetadata: Record<string, string> = {
    ...metadata,
    transaction_id: transactionId,
    listing_id: metadata.listing_id ?? "",
    buyer_id: metadata.buyer_id ?? buyerId,
    seller_id: metadata.seller_id ?? "",
    total_amount: String(totalAmount),
    fee_amount: String(feeAmount),
    shipping_cost: String(shippingCost),
  };

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    shipping_address_collection: {
      allowed_countries: ["FR", "BE", "LU", "CH", "DE", "ES", "IT", "PT", "NL", "AT", "GB"],
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(totalAmount * 100),
          product_data: {
            name: title,
            description: description ?? `Transaction ${transactionId}`,
          },
        },
      },
    ],
    success_url: `${siteUrl}/orders/${transactionId}/success`,
    cancel_url: `${siteUrl}${cancelPath}`,
    metadata: sessionMetadata,
  });
}
