import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, RESEND_FROM } from "@/lib/emails/resend-client";
import { buildDisputeOpenedHtml } from "@/lib/emails/templates/dispute-opened";
import { logInfo } from "@/lib/observability";

const REASON_LABELS: Record<string, string> = {
  DAMAGED_CARD: "Carte abîmée",
  WRONG_CARD: "Mauvaise carte",
  EMPTY_PACKAGE: "Colis vide",
  OTHER: "Autre",
};

export type SendDisputeOpenedParams = {
  transactionId: string;
  sellerId: string;
  buyerId: string;
  reason: string;
  description: string;
  cardName: string;
};

export async function sendDisputeOpenedEmails(
  params: SendDisputeOpenedParams,
): Promise<{ sent: boolean; error?: string }> {
  const resend = getResendClient();
  if (!resend) {
    logInfo({
      event: "dispute_opened_email_skipped",
      context: { reason: "RESEND_API_KEY not set" },
    });
    return { sent: false, error: "Email service not configured" };
  }

  const {
    transactionId,
    sellerId,
    buyerId,
    reason,
    description,
    cardName,
  } = params;

  const admin = createAdminClient();
  const [sellerUser, buyerUser] = await Promise.all([
    admin.auth.admin.getUserById(sellerId),
    admin.auth.admin.getUserById(buyerId),
  ]);
  const sellerEmail = sellerUser?.data?.user?.email;
  const buyerEmail = buyerUser?.data?.user?.email;

  const reasonLabel = REASON_LABELS[reason] ?? reason;
  const baseParams = {
    cardName,
    orderId: transactionId,
    reasonLabel,
    description,
  };

  const results: Promise<{ error: unknown }>[] = [];

  if (sellerEmail) {
    results.push(
      resend.emails
        .send({
          from: RESEND_FROM,
          to: sellerEmail,
          subject: `⚠️ Litige ouvert — ${cardName}`,
          html: buildDisputeOpenedHtml({
            ...baseParams,
            isSeller: true,
          }),
        })
        .then((r) => ({ error: r.error })),
    );
  }

  if (buyerEmail) {
    results.push(
      resend.emails
        .send({
          from: RESEND_FROM,
          to: buyerEmail,
          subject: "Litige enregistré — Notre équipe va vous recontacter",
          html: buildDisputeOpenedHtml({
            ...baseParams,
            isSeller: false,
          }),
        })
        .then((r) => ({ error: r.error })),
    );
  }

  const settled = await Promise.all(results);
  const firstError = settled.find((s) => s.error)?.error;
  if (firstError) {
    return {
      sent: false,
      error: firstError instanceof Error ? firstError.message : String(firstError),
    };
  }
  return { sent: true };
}
