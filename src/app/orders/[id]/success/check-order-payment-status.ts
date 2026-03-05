"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Returns the payment status for the given transaction if the current user is the buyer.
 * Used by the success page to poll until the webhook has confirmed the payment.
 */
export async function checkOrderPaymentStatus(
  transactionId: string,
): Promise<{ paymentStatus: "paid" | "pending" } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row, error } = await supabase
    .from("transactions")
    .select("id, buyer_id, status")
    .eq("id", transactionId)
    .in("status", ["PAID", "PENDING_PAYMENT"])
    .maybeSingle<{ id: string; buyer_id: string; status: string }>();

  if (error || !row || row.buyer_id !== user.id) return null;
  return {
    paymentStatus: row.status === "PAID" ? "paid" : "pending",
  };
}
