import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, RESEND_FROM } from "@/lib/emails/resend-client";
import { buildSellerReceiptConfirmedHtml } from "@/lib/emails/templates/seller-receipt-confirmed";
import { logInfo } from "@/lib/observability";

export type SendSellerReceiptConfirmedParams = {
  transactionId: string;
  sellerId: string;
  cardName: string;
  rating: number;
  hasComment: boolean;
};

export async function sendSellerReceiptConfirmedEmail(
  params: SendSellerReceiptConfirmedParams,
): Promise<{ sent: boolean; error?: string }> {
  const resend = getResendClient();
  if (!resend) {
    logInfo({
      event: "receipt_confirmed_email_skipped",
      context: { reason: "RESEND_API_KEY not set" },
    });
    return { sent: false, error: "Email service not configured" };
  }

  const { transactionId, sellerId, cardName, rating, hasComment } = params;

  const { data: sellerUser } = await createAdminClient().auth.admin.getUserById(
    sellerId,
  );
  const sellerEmail = sellerUser?.user?.email;
  if (!sellerEmail) {
    return { sent: false, error: "Seller email not found" };
  }

  try {
    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: sellerEmail,
      subject: "✅ L'acheteur a bien reçu la carte — Vos fonds sont débloqués",
      html: buildSellerReceiptConfirmedHtml({
        cardName,
        orderId: transactionId,
        rating,
        hasComment,
      }),
    });

    if (error) {
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, error: message };
  }
}
