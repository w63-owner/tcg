import Stripe from "stripe";
import { getRequiredEnvVar, getSiteUrl } from "@/lib/env";

function getStripeClient() {
  return new Stripe(getRequiredEnvVar("STRIPE_SECRET_KEY"));
}

type StripeCheckoutParams = {
  title: string;
  totalAmount: number;
  transactionId: string;
  cancelPath: string;
  metadata: Record<string, string>;
  description?: string;
};

export async function createStripeCheckoutSession(params: StripeCheckoutParams) {
  const { title, totalAmount, transactionId, cancelPath, metadata, description } = params;
  const siteUrl = getSiteUrl();
  const stripeClient = getStripeClient();

  return stripeClient.checkout.sessions.create({
    mode: "payment",
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
    success_url: `${siteUrl}/wallet?checkout=success&tx=${transactionId}`,
    cancel_url: `${siteUrl}${cancelPath}`,
    metadata: {
      ...metadata,
      transaction_id: transactionId,
    },
  });
}
