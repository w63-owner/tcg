"use server";

import { getResendClient, RESEND_FROM } from "@/lib/emails/resend-client";
import { buildBuyerShippedHtml } from "@/lib/emails/templates/buyer-shipped";
import { logError, logInfo } from "@/lib/observability";

export type SendBuyerShippedParams = {
  buyerEmail: string;
  cardName: string;
  trackingNumber?: string;
  trackingUrl?: string;
};

export async function sendBuyerShippedEmail(
  params: SendBuyerShippedParams,
): Promise<{ sent: boolean; error?: string }> {
  const resend = getResendClient();
  if (!resend) {
    logInfo({
      event: "buyer_shipped_email_skipped",
      context: { reason: "RESEND_API_KEY not set" },
    });
    return { sent: false, error: "Email service not configured" };
  }

  const { buyerEmail, cardName, trackingNumber, trackingUrl } = params;

  try {
    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: buyerEmail,
      subject: "🎉 Votre carte est en route !",
      html: buildBuyerShippedHtml({
        cardName,
        trackingNumber,
        trackingUrl,
      }),
    });

    if (error) {
      logError({
        event: "buyer_shipped_email_send_failed",
        message: error.message,
        context: { buyerEmail },
      });
      return { sent: false, error: error.message };
    }

    logInfo({
      event: "buyer_shipped_email_sent",
      context: { buyerEmail },
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logError({
      event: "buyer_shipped_email_exception",
      message,
      context: { buyerEmail },
    });
    return { sent: false, error: message };
  }
}
