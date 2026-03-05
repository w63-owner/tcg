export type SellerReceiptConfirmedParams = {
  cardName: string;
  orderId: string;
  rating: number;
  hasComment: boolean;
};

const baseStyles = `
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  max-width: 560px;
  margin: 0 auto;
`.trim();

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

export function buildSellerReceiptConfirmedHtml(
  params: SellerReceiptConfirmedParams,
): string {
  const { cardName, orderId, rating, hasComment } = params;
  const stars = "★".repeat(Math.min(5, Math.max(0, rating)));
  const starsGray = "☆".repeat(5 - Math.min(5, Math.max(0, rating)));
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commande reçue et notée</title>
</head>
<body style="${baseStyles}; padding: 24px;">
  <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">✅ L'acheteur a bien reçu la carte</h1>
    <p style="margin: 0; color: #166534;">Vos fonds ont été débloqués.</p>
  </div>
  <p>Bonjour,</p>
  <p>L'acheteur a confirmé la réception de <strong>${escapeHtml(cardName)}</strong> et vous a laissé une évaluation&nbsp;:</p>
  <p style="font-size: 18px; margin: 12px 0;" title="${rating}/5">${escapeHtml(stars)}<span style="color: #d1d5db;">${escapeHtml(starsGray)}</span></p>
  ${hasComment ? "<p>Il/Elle a également laissé un commentaire que vous pouvez consulter sur la plateforme.</p>" : ""}
  <p><strong>Référence commande</strong>&nbsp;: ${escapeHtml(orderId)}</p>
  <p>Merci pour votre confiance.</p>
  <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">— L'équipe TCG</p>
</body>
</html>
  `.trim();
}
