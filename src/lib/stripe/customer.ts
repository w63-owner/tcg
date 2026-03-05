import Stripe from "stripe";
import { getRequiredEnvVar } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

function getStripeClient() {
  return new Stripe(getRequiredEnvVar("STRIPE_SECRET_KEY"));
}

/**
 * Returns the Stripe customer id for the given user, creating the customer if needed.
 * Used by checkout and profile payment methods.
 */
export async function getOrCreateStripeCustomerId(
  userId: string,
  userEmail: string,
): Promise<string> {
  const stripe = getStripeClient();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  if (profile?.stripe_customer_id?.trim()) {
    return profile.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: userEmail,
    metadata: { supabase_user_id: userId },
  });

  await admin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}
