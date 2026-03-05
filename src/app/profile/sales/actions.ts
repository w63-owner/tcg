"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBuyerShippedEmail } from "@/lib/emails/send-buyer-shipped";
import { logError, logInfo } from "@/lib/observability";

export type MarkAsShippedResult = { ok: true } | { ok: false; error: string };

export async function markAsShippedAction(
  transactionId: string,
  formData: FormData,
): Promise<MarkAsShippedResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Non authentifié." };
  }

  const trackingNumber = String(formData.get("tracking_number") ?? "").trim();
  const trackingUrl = String(formData.get("tracking_url") ?? "").trim();

  const { data: tx, error: fetchError } = await supabase
    .from("transactions")
    .select("id, seller_id, buyer_id, status, listing:listings(title)")
    .eq("id", transactionId)
    .eq("seller_id", user.id)
    .maybeSingle<{
      id: string;
      seller_id: string;
      buyer_id: string;
      status: string;
      listing: { title: string } | Array<{ title: string }> | null;
    }>();

  if (fetchError || !tx) {
    logInfo({
      event: "mark_as_shipped_unauthorized_or_not_found",
      context: { transactionId, userId: user.id },
    });
    return { ok: false, error: "Commande introuvable ou vous n'êtes pas le vendeur." };
  }

  if (tx.status !== "PAID") {
    return { ok: false, error: "Cette commande n'est plus en attente d'expédition." };
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      status: "SHIPPED",
      tracking_number: trackingNumber || null,
      tracking_url: trackingUrl || null,
      shipped_at: new Date().toISOString(),
    })
    .eq("id", transactionId)
    .eq("seller_id", user.id)
    .eq("status", "PAID");

  if (updateError) {
    logError({
      event: "mark_as_shipped_update_failed",
      message: updateError.message,
      context: { transactionId },
    });
    return { ok: false, error: "Impossible de mettre à jour la commande." };
  }

  const listingTitle =
    Array.isArray(tx.listing) ? tx.listing[0]?.title : (tx.listing as { title: string } | null)?.title ?? "Votre carte";

  try {
    const admin = createAdminClient();
    const { data: buyerUser } = await admin.auth.admin.getUserById(tx.buyer_id);
    const buyerEmail = buyerUser?.user?.email;
    if (buyerEmail) {
      await sendBuyerShippedEmail({
        buyerEmail,
        cardName: listingTitle,
        trackingNumber: trackingNumber || undefined,
        trackingUrl: trackingUrl || undefined,
      });
    } else {
      logInfo({
        event: "buyer_shipped_email_skipped_no_email",
        context: { transactionId, buyerId: tx.buyer_id },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logError({
      event: "buyer_shipped_email_failed",
      message,
      context: { transactionId },
    });
    // Don't fail the action: shipping was recorded
  }

  revalidatePath("/profile/sales");
  revalidatePath(`/profile/sales/${transactionId}`);
  return { ok: true };
}
