"use server";

import { getResendClient, RESEND_FROM } from "@/lib/emails/resend-client";
import { buildBuyerReceiptHtml } from "@/lib/emails/templates/buyer-receipt";
import { buildSellerSoldHtml } from "@/lib/emails/templates/seller-sold";
import { logError, logInfo } from "@/lib/observability";

export type SendTransactionEmailsParams = {
  buyerEmail: string;
  sellerEmail: string;
  cardName: string;
  totalAmountFormatted: string;
  transactionId: string;
  shippingAddressFormatted: string;
};

export async function sendTransactionEmails(
  params: SendTransactionEmailsParams,
): Promise<{ sent: boolean; error?: string }> {
  const resend = getResendClient();
  if (!resend) {
    logInfo({
      event: "transaction_emails_skipped",
      context: { reason: "RESEND_API_KEY not set" },
    });
    return { sent: false, error: "Email service not configured" };
  }

  const {
    buyerEmail,
    sellerEmail,
    cardName,
    totalAmountFormatted,
    transactionId,
    shippingAddressFormatted,
  } = params;

  try {
    const [buyerResult, sellerResult] = await Promise.all([
      resend.emails.send({
        from: RESEND_FROM,
        to: buyerEmail,
        subject: "Confirmation de votre commande",
        html: buildBuyerReceiptHtml({
          cardName,
          totalAmountFormatted,
          orderId: transactionId,
        }),
      }),
      resend.emails.send({
        from: RESEND_FROM,
        to: sellerEmail,
        subject: `🎉 Vous avez vendu : ${cardName}`,
        html: buildSellerSoldHtml({
          cardName,
          totalAmountFormatted,
          shippingAddressFormatted,
          orderId: transactionId,
        }),
      }),
    ]);

    if (buyerResult.error || sellerResult.error) {
      logError({
        event: "transaction_emails_send_failed",
        message: buyerResult.error?.message ?? sellerResult.error?.message,
        context: {
          transactionId,
          buyerError: buyerResult.error?.message,
          sellerError: sellerResult.error?.message,
        },
      });
      return {
        sent: false,
        error: buyerResult.error?.message ?? sellerResult.error?.message,
      };
    }

    logInfo({
      event: "transaction_emails_sent",
      context: { transactionId },
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logError({
      event: "transaction_emails_exception",
      message,
      context: { transactionId },
    });
    return { sent: false, error: message };
  }
}
