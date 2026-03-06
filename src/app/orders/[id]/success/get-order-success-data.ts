import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getRequiredEnvVar } from "@/lib/env";

export type OrderSuccessData = {
  transactionId: string;
  cardName: string;
  totalAmount: number;
  totalAmountFormatted: string;
  shippingAddress: string | null;
  createdAt: string;
  /** When "pending", the webhook may not have run yet; show a processing state. */
  paymentStatus: "paid" | "pending";
  /** Conversation id for this sale (buyer–seller); used for "Voir la conversation" link. */
  conversationId: string | null;
};

/**
 * Fetches order details for the success page. Ensures the current user is the buyer.
 * Returns null if not found or not the buyer (caller should then redirect/404).
 */
export async function getOrderSuccessData(
  transactionId: string,
): Promise<OrderSuccessData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row, error } = await supabase
    .from("transactions")
    .select(
      "id, total_amount, created_at, buyer_id, seller_id, listing_id, stripe_checkout_session_id, status, listing_title, listing:listings(title)",
    )
    .eq("id", transactionId)
    .in("status", ["PAID", "PENDING_PAYMENT"])
    .maybeSingle<{
      id: string;
      total_amount: number;
      created_at: string;
      buyer_id: string;
      seller_id: string;
      listing_id: string;
      stripe_checkout_session_id: string | null;
      status: string;
      listing_title: string | null;
      listing: { title: string } | { title: string }[] | null;
    }>();

  if (error || !row) return null;
  if (row.buyer_id !== user.id) return null;

  const listing = Array.isArray(row.listing) ? row.listing[0] : row.listing;
  const cardName = row.listing_title ?? listing?.title ?? "Annonce";

  const paymentStatus = row.status === "PAID" ? "paid" : "pending";

  let shippingAddress: string | null = null;
  if (row.status === "PAID" && row.stripe_checkout_session_id) {
    try {
      const stripe = new Stripe(getRequiredEnvVar("STRIPE_SECRET_KEY"));
      const session = await stripe.checkout.sessions.retrieve(
        row.stripe_checkout_session_id,
        { expand: ["customer_details"] },
      );
      const addr = session.customer_details?.address;
      if (addr) {
        const parts = [
          addr.line1,
          addr.line2,
          [addr.postal_code, addr.city].filter(Boolean).join(" "),
          addr.state,
          addr.country,
        ].filter(Boolean);
        shippingAddress = parts.join("\n") || null;
      }
    } catch {
      // Ignore Stripe errors; we still show the page without address
    }
  }

  const totalAmount = Number(row.total_amount);

  let conversationId: string | null = null;
  try {
    const { data: convId } = await supabase.rpc("ensure_conversation_for_users", {
      p_listing_id: row.listing_id,
      p_buyer_id: row.buyer_id,
      p_seller_id: row.seller_id,
    });
    if (typeof convId === "string") conversationId = convId;
  } catch {
    // ignore
  }

  return {
    transactionId: row.id,
    cardName,
    totalAmount,
    totalAmountFormatted: `${totalAmount.toFixed(2)} €`,
    shippingAddress,
    createdAt: row.created_at,
    paymentStatus,
    conversationId,
  };
}
