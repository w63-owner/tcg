"use server";

import Stripe from "stripe";
import { getRequiredEnvVar } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateStripeCustomerId } from "@/lib/stripe/customer";

function getStripeClient() {
  return new Stripe(getRequiredEnvVar("STRIPE_SECRET_KEY"));
}

export type PaymentMethodSummary = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName: string | null;
};

/**
 * Creates a SetupIntent for the current user so they can add a payment method.
 * Returns client_secret for Stripe Elements.
 */
export async function createSetupIntent(): Promise<
  { clientSecret: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "Non connecté." };
  }

  const customerId = await getOrCreateStripeCustomerId(user.id, user.email);
  const stripe = getStripeClient();
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    usage: "off_session",
  });

  if (!setupIntent.client_secret) {
    return { error: "Impossible de créer la session d'ajout de carte." };
  }
  return { clientSecret: setupIntent.client_secret };
}

/**
 * Lists payment methods (cards) attached to the current user's Stripe customer.
 */
export async function listPaymentMethods(): Promise<
  PaymentMethodSummary[] | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "Non connecté." };
  }

  const customerId = await getOrCreateStripeCustomerId(user.id, user.email);
  const stripe = getStripeClient();
  const list = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
  });

  return list.data.map((pm) => ({
    id: pm.id,
    brand: pm.card?.brand ?? "card",
    last4: pm.card?.last4 ?? "****",
    expMonth: pm.card?.exp_month ?? 0,
    expYear: pm.card?.exp_year ?? 0,
    holderName: pm.billing_details?.name ?? null,
  }));
}

/**
 * Detaches a payment method from the current user's Stripe customer.
 * Verifies the payment method belongs to the user's customer before detaching.
 */
export async function detachPaymentMethod(
  paymentMethodId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "Non connecté." };
  }

  const customerId = await getOrCreateStripeCustomerId(user.id, user.email);
  const stripe = getStripeClient();

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (pm.customer !== customerId) {
    return { error: "Ce moyen de paiement ne vous appartient pas." };
  }

  await stripe.paymentMethods.detach(paymentMethodId);
  return { ok: true };
}
